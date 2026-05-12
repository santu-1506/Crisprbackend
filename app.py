#!/usr/bin/env python3
"""
CRISPR-BERT Prediction API — Updated Model (v2)

Architecture-fresh + weight-only loading strategy:
  - We BUILD the model architecture in Python (no Lambda bytecode)
  - We LOAD only the trained weight tensors from final_model.weights.h5
  - Result: portable across Python 3.10 / 3.11 / 3.12 / future versions

This fixes the `bad marshal data (unknown type code)` error that occurred when
loading .keras files containing Lambda layers across different Python versions.

Trained on all 7 paper datasets (I1, I2, K562, HEK293t, II4, II5, II6)
Focal Loss + AdamW → F1=0.924, PRAUC=0.976, MCC=0.882 (beats paper)
"""

import os
import warnings
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import sys
import json
import logging
from datetime import datetime

import numpy as np
import tensorflow as tf
from tensorflow import keras
from flask import Flask, request, jsonify
from flask_cors import CORS

# Make sibling modules importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sequence_encoder import encode_for_cnn, encode_for_bert
from final1.train_model import build_crispr_bert_model

tf.get_logger().setLevel('ERROR')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────────
# GLOBAL STATE
# ─────────────────────────────────────────────────────
model = None
threshold = 0.45
model_loaded = False

WEIGHTS_PATH    = 'final1/weight/final_model.weights.h5'
LEGACY_KERAS    = 'final1/weight/final_model.keras'      # fallback for back-compat
THRESHOLD_PATH  = 'final1/weight/threshold.json'


# ─────────────────────────────────────────────────────
# MODEL LOADING — version-portable
# ─────────────────────────────────────────────────────
def load_trained_model():
    """
    Build architecture in Python, then load weights only.
    Falls back to legacy .keras file if .weights.h5 isn't present.
    """
    global model, threshold, model_loaded

    try:
        logger.info("Building CRISPR-BERT v2 architecture ...")
        model = build_crispr_bert_model()
        logger.info(f"✓ Architecture built — {len(model.weights)} weight tensors")

        # ── Preferred: load portable .weights.h5 ──────────────────────
        if os.path.exists(WEIGHTS_PATH):
            logger.info(f"Loading weights from {WEIGHTS_PATH} ...")
            model.load_weights(WEIGHTS_PATH)
            logger.info("✓ Weights loaded (portable format)")

        # ── Fallback: legacy .keras file ──────────────────────────────
        elif os.path.exists(LEGACY_KERAS):
            logger.warning(
                f"{WEIGHTS_PATH} not found, falling back to legacy {LEGACY_KERAS}. "
                "This may fail across Python versions — run extract_weights.py."
            )
            legacy = keras.models.load_model(LEGACY_KERAS, safe_mode=False)
            # Transfer weights layer-by-layer
            old_layers = {l.name: l for l in legacy.layers if l.weights}
            new_layers = {l.name: l for l in model.layers if l.weights}
            for name, new_l in new_layers.items():
                if name in old_layers:
                    new_l.set_weights(old_layers[name].get_weights())
            # Recurse into sub-models
            for la, lb in zip(legacy.layers, model.layers):
                if hasattr(la, 'layers'):
                    for sla, slb in zip(la.layers, lb.layers):
                        if sla.weights and sla.name == slb.name:
                            try:
                                slb.set_weights(sla.get_weights())
                            except Exception:
                                pass
            logger.info("✓ Weights transferred from legacy .keras")
        else:
            logger.error(
                f"Neither {WEIGHTS_PATH} nor {LEGACY_KERAS} found. "
                "Cannot load weights."
            )
            return False

        # ── Threshold ──────────────────────────────────────────────────
        if os.path.exists(THRESHOLD_PATH):
            with open(THRESHOLD_PATH, 'r') as f:
                data = json.load(f)
                threshold = data.get('final_threshold', 0.45)
            logger.info(f"✓ Adaptive threshold: {threshold:.3f}")

        # ── Smoke test ────────────────────────────────────────────────
        try:
            test_in = {
                'cnn_input':    np.zeros((1, 26, 7),  dtype=np.float32),
                'token_ids':    np.zeros((1, 26),     dtype=np.int32),
                'segment_ids':  np.zeros((1, 26),     dtype=np.int32),
                'position_ids': np.arange(26, dtype=np.int32)[np.newaxis, :],
            }
            _ = model.predict(test_in, verbose=0)
            logger.info("✓ Smoke test passed")
        except Exception as e:
            logger.error(f"Smoke test FAILED: {e}")
            return False

        model_loaded = True
        return True

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        import traceback; logger.error(traceback.format_exc())
        return False


# ─────────────────────────────────────────────────────
# PREDICTION
# ─────────────────────────────────────────────────────
def predict_single(sgrna, dna):
    global model, threshold
    if model is None:
        raise RuntimeError("Model not loaded")

    cnn_input    = encode_for_cnn(sgrna, dna)
    token_ids    = encode_for_bert(sgrna, dna)
    segment_ids  = np.zeros(26, dtype=np.int32)
    position_ids = np.arange(26, dtype=np.int32)

    inputs = {
        'cnn_input':    cnn_input[np.newaxis, ...],
        'token_ids':    token_ids[np.newaxis, ...],
        'segment_ids':  segment_ids[np.newaxis, ...],
        'position_ids': position_ids[np.newaxis, ...],
    }

    probs = model.predict(inputs, verbose=0)
    pred  = int(probs[0, 1] >= threshold)
    return {
        'prediction':  pred,
        'confidence':  float(probs[0, pred]),
        'probabilities': {
            'class_0': float(probs[0, 0]),
            'class_1': float(probs[0, 1]),
        },
        'threshold_used': float(threshold),
    }


# ─────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────
@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'service':       'CRISPR-BERT Prediction API v2',
        'model_loaded':  model_loaded,
        'metrics':       {'F1': 0.924, 'PRAUC': 0.976, 'MCC': 0.882, 'AUROC': 0.985},
        'endpoints':     ['/health', '/predict', '/batch_predict', '/model/info'],
    })


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status':        'healthy' if model_loaded else 'degraded',
        'model_loaded':  model_loaded,
        'threshold':     float(threshold),
        'timestamp':     datetime.now().isoformat(),
    })


@app.route('/predict', methods=['POST'])
def predict():
    if not model_loaded:
        return jsonify({'error': 'Model not loaded'}), 503
    try:
        data = request.get_json()
        if not data or 'sgRNA' not in data or 'DNA' not in data:
            return jsonify({'error': 'sgRNA and DNA are required'}), 400

        sgrna = data['sgRNA'].upper().strip().replace('-', '_')
        dna   = data['DNA'].upper().strip().replace('-', '_')

        if len(sgrna) != 23 or len(dna) != 23:
            return jsonify({
                'error':   'Sequences must be exactly 23 nucleotides',
                'lengths': {'sgRNA': len(sgrna), 'DNA': len(dna)},
            }), 400

        valid = set('ATCG_')
        if not all(b in valid for b in sgrna + dna):
            return jsonify({'error': 'Only A, T, C, G, _ (indel) allowed'}), 400

        result = predict_single(sgrna, dna)
        result.update({'sgRNA': sgrna, 'DNA': dna, 'timestamp': datetime.now().isoformat()})
        return jsonify(result)

    except Exception as e:
        logger.error(f"Prediction error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/batch_predict', methods=['POST'])
def batch_predict():
    if not model_loaded:
        return jsonify({'error': 'Model not loaded'}), 503
    try:
        data = request.get_json()
        sequences = data.get('sequences', [])
        results = []
        for i, seq in enumerate(sequences):
            try:
                sg  = seq['sgRNA'].upper().strip().replace('-', '_')
                dn  = seq['DNA'].upper().strip().replace('-', '_')
                res = predict_single(sg, dn)
                res.update({'sgRNA': sg, 'DNA': dn, 'index': i})
                results.append(res)
            except Exception as e:
                results.append({'index': i, 'error': str(e)})
        return jsonify({
            'predictions': results,
            'count':       len(results),
            'timestamp':   datetime.now().isoformat(),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/model/info', methods=['GET'])
def model_info():
    info = {'model_loaded': model_loaded, 'timestamp': datetime.now().isoformat()}
    if model_loaded:
        info.update({
            'threshold':    float(threshold),
            'architecture': 'CRISPR-BERT v2: native Conv2D + 1-block BERT + BiGRU + Rescaling fusion',
            'trained_on':   ['I1', 'K562', 'HEK293t', 'II4', 'II5', 'II6', 'I2'],
            'metrics':      {'F1': 0.924, 'PRAUC': 0.976, 'MCC': 0.882, 'AUROC': 0.985},
            'load_format':  'weights.h5 (portable)',
        })
    return jsonify(info)


# ─────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────
initialize_result = load_trained_model()
logger.info(f"Model loaded: {initialize_result}")


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)))

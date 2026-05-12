#!/usr/bin/env python3
"""
CRISPR-BERT Prediction API
Flask API serving CRISPR off-target predictions using hybrid CNN-BERT architecture
"""

import os
import warnings

# Suppress warnings
warnings.filterwarnings('ignore')

# Set TensorFlow environment variables before importing
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'  # Disable GPU (Cloud Run doesn't have GPUs)

import logging
# ==============================================================================
# CONFIGURE LOGGER FIRST
# This is critical to ensure that any import errors or early failures are logged.
# ==============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("Logger configured. Starting application imports...")

import numpy as np
import tensorflow as tf
from tensorflow import keras
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from datetime import datetime
import threading
import time

# Now, import project-specific modules
try:
    from sequence_encoder import encode_for_cnn, encode_for_bert
    from data_loader import load_dataset
    from final1.train_model import build_crispr_bert_model
    logger.info("Successfully imported all model definition modules.")
except ImportError as e:
    logger.error(f"CRITICAL STARTUP ERROR: Could not import a required module: {e}")
    logger.error("This is likely due to a missing file in the Docker image or a Python path issue.")
    logger.error("Please ensure 'sequence_encoder.py', 'data_loader.py', and the 'final1' package are correctly copied in the Dockerfile.")
    # Set a flag or exit if the build function is not available
    build_crispr_bert_model = None

# Suppress TensorFlow warnings
tf.get_logger().setLevel('ERROR')

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Global model and configuration
model = None
# Prefer the portable .weights.h5 file (Python-version-independent).
# Fall back to .keras only if the new file isn't present.
MODEL_PATH_WEIGHTS = "final1/weight/final_model.weights.h5"
MODEL_PATH_KERAS   = "final1/weight/final_model.keras"
MODEL_PATH = MODEL_PATH_WEIGHTS if os.path.exists(MODEL_PATH_WEIGHTS) else MODEL_PATH_KERAS

threshold = 0.5
model_loaded = False

# Configuration
THRESHOLD_PATH = 'final1/weight/threshold.json'


def load_trained_model():
    """
    Load the trained CRISPR-BERT model by rebuilding the architecture
    from source and loading weights from the .h5 file.
    """
    global model, threshold, model_loaded
    
    if build_crispr_bert_model is None:
        logger.error("Cannot load model because build_crispr_bert_model function is not available.")
        return False

    try:
        # Check if weights file exists
        weights_path = MODEL_PATH
        if not os.path.exists(weights_path):
            logger.error(f"Model weights file not found at {weights_path}")
            return False
        
        logger.info("=" * 60)
        logger.info("STEP 1: Building model architecture from source code...")
        # Re-create the model architecture programmatically
        model = build_crispr_bert_model()
        logger.info("✓ Model architecture created successfully.")
        model.summary(print_fn=logger.info)
        logger.info("=" * 60)

        # Configure TensorFlow for low memory BEFORE loading weights
        try:
            os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
            tf.config.threading.set_inter_op_parallelism_threads(1)
            tf.config.threading.set_intra_op_parallelism_threads(1)
            logger.info("✓ TensorFlow configured for low-memory environment")
        except Exception as config_error:
            logger.warning(f"Could not configure TensorFlow devices: {config_error}")

        logger.info("=" * 60)
        logger.info(f"STEP 2: Loading weights from '{weights_path}'...")
        # Load ONLY the weights into the fresh model architecture
        model.load_weights(weights_path)
        logger.info("✓✓✓ Model weights loaded successfully! ✓✓✓")
        logger.info("=" * 60)
        
        # Load adaptive threshold
        threshold_path = THRESHOLD_PATH
        if os.path.exists(threshold_path):
            with open(threshold_path, 'r') as f:
                data = json.load(f)
                threshold = data.get('final_threshold', 0.5)
                logger.info(f"✓ Using adaptive threshold: {threshold:.3f}")
        else:
            logger.warning(f"Threshold file not found at {threshold_path}. Using default 0.5.")
            threshold = 0.5
        
        model_loaded = True
        return True
        
    except Exception as e:
        logger.error(f"❌❌❌ FINAL ERROR: Failed to load model with new method: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def predict_single(sgrna, dna):
    """
    Make prediction for a single sgRNA-DNA pair
    
    Args:
        sgrna: Guide RNA sequence
        dna: Target DNA sequence
    
    Returns:
        dict: Prediction results with probabilities
    """
    global model, threshold
    
    if model is None:
        raise RuntimeError("Model not loaded")
    
    # Encode sequences
    cnn_input = encode_for_cnn(sgrna, dna)  # (26, 7)
    token_ids = encode_for_bert(sgrna, dna)  # (26,)
    segment_ids = np.zeros(26, dtype=np.int32)
    position_ids = np.arange(26, dtype=np.int32)
    
    # Add batch dimension
    inputs = {
        'cnn_input': cnn_input[np.newaxis, ...],
        'token_ids': token_ids[np.newaxis, ...],
        'segment_ids': segment_ids[np.newaxis, ...],
        'position_ids': position_ids[np.newaxis, ...]
    }
    
    # Make prediction
    probabilities = model.predict(inputs, verbose=0)
    
    # Apply threshold
    predicted_class = int((probabilities[0, 1] >= threshold))
    confidence = float(probabilities[0, predicted_class])
    
    return {
        'prediction': predicted_class,
        'confidence': confidence,
        'probabilities': {
            'class_0': float(probabilities[0, 0]),
            'class_1': float(probabilities[0, 1])
        },
        'threshold_used': float(threshold)
    }




@app.route('/', methods=['GET'])
def root():
    """Root endpoint - API information"""
    return jsonify({
        'service': 'CRISPR-BERT Prediction API',
        'status': 'running',
        'model_loaded': model_loaded,
        'endpoints': {
            'health': '/health',
            'predict': '/predict (POST)',
            'batch_predict': '/batch_predict (POST)',
            'model_info': '/model/info'
        },
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model_loaded,
        'timestamp': datetime.now().isoformat(),
        'model_path': MODEL_PATH,
        'threshold': float(threshold) if model_loaded else None
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Main prediction endpoint
    
    Request body:
        {
            "sgRNA": "GGTGAGTGAGTGTGTGCGTGTGG",
            "DNA": "TGTGAGTGTGTGTGTGTGTGTGT"
        }
    
    Response:
        {
            "prediction": 0 or 1,
            "confidence": 0.0-1.0,
            "probabilities": {
                "class_0": 0.0-1.0,
                "class_1": 0.0-1.0
            },
            "sgRNA": "...",
            "DNA": "...",
            "timestamp": "..."
        }
    """
    # Try to load model if not already loaded
    global model_loaded
    if not model_loaded:
        logger.info("Model not loaded yet, attempting to load now...")
        try:
            initialize_app()
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
    
    if not model_loaded:
        return jsonify({
            'error': 'Model not loaded',
            'message': 'Please wait for model initialization or check server logs'
        }), 503
    
    try:
        # Parse request
        data = request.get_json()
        
        if not data or 'sgRNA' not in data or 'DNA' not in data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Both sgRNA and DNA sequences are required'
            }), 400
        
        sgrna = data['sgRNA'].upper().strip()
        dna = data['DNA'].upper().strip()
        
        # Convert - (dash) to _ (underscore) for indel encoding
        sgrna = sgrna.replace('-', '_')
        dna = dna.replace('-', '_')
        
        # Validate sequences
        if len(sgrna) != 23 or len(dna) != 23:
            return jsonify({
                'error': 'Invalid sequence length',
                'message': 'Both sequences must be exactly 23 nucleotides long',
                'received_lengths': {
                    'sgRNA': len(sgrna),
                    'DNA': len(dna)
                }
            }), 400
        
        # Allow ATCG and _ (underscore for indels/deletions)
        valid_bases = set('ATCG_')
        if not all(base in valid_bases for base in sgrna + dna):
            return jsonify({
                'error': 'Invalid nucleotides',
                'message': 'Sequences must contain only A, T, C, G, or - (for indels/deletions)'
            }), 400
        
        # Make prediction
        result = predict_single(sgrna, dna)
        
        # Add request info to response
        result.update({
            'sgRNA': sgrna,
            'DNA': dna,
            'timestamp': datetime.now().isoformat()
        })
        
        # Log prediction
        logger.info(
            f"Prediction: {sgrna} vs {dna} → "
            f"Class {result['prediction']} "
            f"(confidence: {result['confidence']:.3f})"
        )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Prediction failed',
            'message': str(e)
        }), 500


@app.route('/batch_predict', methods=['POST'])
def batch_predict():
    """
    Batch prediction endpoint
    
    Request body:
        {
            "sequences": [
                {"sgRNA": "...", "DNA": "..."},
                {"sgRNA": "...", "DNA": "..."}
            ]
        }
    
    Response:
        {
            "predictions": [
                {"prediction": 0, "confidence": 0.95, ...},
                ...
            ],
            "count": 2,
            "timestamp": "..."
        }
    """
    if not model_loaded:
        return jsonify({
            'error': 'Model not loaded',
            'message': 'Please wait for model initialization'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data or 'sequences' not in data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'sequences array is required'
            }), 400
        
        sequences = data['sequences']
        
        if not isinstance(sequences, list) or len(sequences) == 0:
            return jsonify({
                'error': 'Invalid request',
                'message': 'sequences must be a non-empty array'
            }), 400
        
        # Process each sequence
        results = []
        for i, seq in enumerate(sequences):
            try:
                sgrna = seq['sgRNA'].upper().strip()
                dna = seq['DNA'].upper().strip()
                
                # Convert - (dash) to _ (underscore) for indel encoding
                sgrna = sgrna.replace('-', '_')
                dna = dna.replace('-', '_')
                
                result = predict_single(sgrna, dna)
                result['sgRNA'] = sgrna
                result['DNA'] = dna
                result['index'] = i
                results.append(result)
                
            except Exception as e:
                results.append({
                    'index': i,
                    'error': str(e),
                    'sgRNA': seq.get('sgRNA', ''),
                    'DNA': seq.get('DNA', '')
                })
        
        return jsonify({
            'predictions': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Batch prediction failed',
            'message': str(e)
        }), 500


@app.route('/model/info', methods=['GET'])
def model_info():
    """Get model information"""
    info = {
        'model_loaded': model_loaded,
        'model_type': 'CRISPR-BERT (Hybrid CNN-BERT)',
        'timestamp': datetime.now().isoformat()
    }
    
    if model_loaded:
        info.update({
            'model_path': MODEL_PATH,
            'threshold': float(threshold),
            'architecture': {
                'cnn_branch': 'Inception CNN — native Conv2D (5/15/25/35 filters, 1×1 to 5×5 kernels)',
                'bert_branch': 'BERT-style transformer — 4 blocks, 256-dim, 4-head attention',
                'bigru_layers': 'Bidirectional GRU (40 units each direction)',
                'fusion': 'Flatten ALL 26 timesteps → Dense(128) → Dense(64)',
                'weights': 'CNN: 20%, BERT: 80% (per paper §2.4)',
                'output': 'Binary classification — 2-class softmax'
            },
            'input_format': {
                'sgRNA_length': 23,
                'DNA_length': 23,
                'encoding': {
                    'cnn': '26x7 matrix (with [CLS] and [SEP] tokens)',
                    'bert': '26 token IDs'
                }
            }
        })
    
    return jsonify(info)


@app.route('/debug/files', methods=['GET'])
def debug_files():
    """Debug endpoint to check what files exist"""
    files_info = {
        'working_directory': os.getcwd(),
        'model_path_exists': os.path.exists(MODEL_PATH),
        'model_path_checked': MODEL_PATH,
        'final1_exists': os.path.exists('final1'),
        'final1_weight_exists': os.path.exists('final1/weight'),
        'files_in_final1': [],
        'files_in_final1_weight': []
    }
    
    try:
        if os.path.exists('final1'):
            files_info['files_in_final1'] = os.listdir('final1')
        if os.path.exists('final1/weight'):
            weight_files = os.listdir('final1/weight')
            files_info['files_in_final1_weight'] = []
            for f in weight_files:
                full_path = os.path.join('final1/weight', f)
                size = os.path.getsize(full_path) if os.path.isfile(full_path) else 'dir'
                files_info['files_in_final1_weight'].append({
                    'name': f,
                    'size': size
                })
    except Exception as e:
        files_info['error'] = str(e)
    
    return jsonify(files_info)


def initialize_app():
    """Initialize the application"""
    logger.info("=" * 60)
    logger.info("CRISPR-BERT Prediction API")
    logger.info("Hybrid CNN-BERT Architecture for Off-Target Prediction")
    logger.info("=" * 60)
    
    success = load_trained_model()
    
    if success:
        logger.info("✓ API ready to serve predictions")
    else:
        logger.warning("⚠ API started but model not loaded")
        logger.warning("Please train the model using: python final1/train_model.py")
    
    return success


if __name__ == '__main__':
    initialize_app()
    
    # Run Flask app (for local development)
    port = int(os.environ.get('PORT', 5001))
    logger.info(f"\nStarting server on port {port}...")
    logger.info("=" * 60)
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False
    )
else:
    # When imported by gunicorn: Load model in background after server starts
    # This allows health checks to pass while model loads
    logger.info("=" * 60)
    logger.info("App imported by gunicorn - will load model in background")
    logger.info("=" * 60)
    
    import threading
    import time
    
    def load_model_delayed():
        """Load model after a short delay to let server start"""
        logger.info("Background thread started - waiting 2 seconds...")
        time.sleep(2)  # Give server time to start listening
        logger.info("Starting model loading in background NOW...")
        logger.info(f"Current working directory: {os.getcwd()}")
        logger.info(f"Model path to load: {MODEL_PATH}")
        logger.info(f"Model file exists: {os.path.exists(MODEL_PATH)}")
        try:
            success = initialize_app()
            if success:
                logger.info("✓✓✓ Model loaded successfully in background! ✓✓✓")
            else:
                logger.error("✗✗✗ Model loading FAILED in background ✗✗✗")
        except Exception as e:
            logger.error(f"✗✗✗ Exception during model loading: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    # Start background thread to load model
    model_thread = threading.Thread(target=load_model_delayed, daemon=False, name="ModelLoader")
    model_thread.start()
    logger.info(f"Background model loading thread started: {model_thread.name}")
    logger.info(f"Thread is alive: {model_thread.is_alive()}")
    logger.info("=" * 60)

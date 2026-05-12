import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Sparkles, RotateCcw, Lightbulb, Loader2, Zap,
  FlaskConical, BookOpen, ArrowRight, Cpu,
} from 'lucide-react';
import { getCurrentUser } from '../utils/userStorage';
import { predictionAPI } from '../utils/api';

import SequenceInput   from '../components/SequenceInput';
import PredictionResult from '../components/PredictionResult';

// ─────────────────────────────────────────────────────────
// Sample sequences with rich context
// ─────────────────────────────────────────────────────────
const SAMPLES = [
  {
    name: 'Perfect Match',
    summary: 'Identical sgRNA & DNA — definite cut',
    sgRNA: 'GGTGAGTGAGTGTGTGCGTGTGG',
    DNA:   'GGTGAGTGAGTGTGTGCGTGTGG',
    actualLabel: 1,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    name: 'Single Mismatch',
    summary: '1 mismatch in seed region',
    sgRNA: 'ATGGTAGTTTTGGCTGCACAAGG',
    DNA:   'ATGGTGTTTTTGGCTGCACAAGG',
    actualLabel: 1,
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    name: 'PAM Mismatch',
    summary: 'PAM doesn\'t match — no cut',
    sgRNA: 'ATCGATCGATCGATCGATCAGGG',
    DNA:   'ATCGATCGATCGATCGATCTGGA',
    actualLabel: 0,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    name: 'Many Mismatches',
    summary: 'Multiple mismatches — safe',
    sgRNA: 'GCGAGTTTTCATGTTTTCGACGG',
    DNA:   'GTTAAAGATCGAGCCTAATAGGG',
    actualLabel: 0,
    gradient: 'from-purple-500 to-pink-600',
  },
];

// ─────────────────────────────────────────────────────────
// Tip cards (rotated during loading)
// ─────────────────────────────────────────────────────────
const TIPS = [
  'Mismatches near the PAM (positions 18-20) are much harder for Cas9 to tolerate than ones far away.',
  'The "seed region" (positions 8-12) is the most sensitive to mismatches — even one can prevent cutting.',
  'Cas9 needs a PAM sequence (typically NGG) immediately 3\' of the target. No PAM, no cut.',
  'GC content between 40-60% is the sweet spot for Cas9 efficiency.',
  'Indels (-) can be more disruptive than mismatches because they shift the alignment.',
  'Our model was trained on 7 public datasets totalling 1.7 million sgRNA-DNA pairs.',
];

// ─────────────────────────────────────────────────────────
// Loading overlay
// ─────────────────────────────────────────────────────────
const LoadingState = () => {
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-10 text-center"
    >
      <div className="relative w-20 h-20 mx-auto mb-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-cyan-400/30 border-t-cyan-400"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-2 rounded-full border-2 border-purple-400/30 border-t-purple-400"
        />
        <Cpu className="absolute inset-0 m-auto w-8 h-8 text-cyan-400" />
      </div>
      <h3 className="text-xl font-display font-bold mb-2">Running CRISPR-BERT...</h3>
      <p className="text-sm text-zinc-500 mb-6">Encoding sequences → CNN → Transformer → Decision</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={tipIdx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="max-w-md mx-auto p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20"
        >
          <div className="flex items-start gap-2 text-left">
            <Lightbulb className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-300 leading-relaxed">{TIPS[tipIdx]}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────
// Sample chip
// ─────────────────────────────────────────────────────────
const SampleChip = ({ sample, onLoad, idx }) => (
  <motion.button
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 0.1 + idx * 0.06 }}
    whileHover={{ x: 4 }}
    onClick={() => onLoad(sample)}
    className="w-full p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-cyan-500/30 transition text-left group"
  >
    <div className="flex items-start gap-3">
      <div className={`w-1.5 h-12 rounded-full bg-gradient-to-b ${sample.gradient} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm mb-0.5">{sample.name}</div>
        <div className="text-xs text-zinc-500 mb-1">{sample.summary}</div>
        <div className="font-mono text-[10px] text-zinc-600 truncate">
          {sample.sgRNA.slice(0, 12)}...
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition flex-shrink-0 mt-1" />
    </div>
  </motion.button>
);

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
const Predict = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [sequences, setSequences] = useState({ sgRNA: '', DNA: '', actualLabel: 1 });
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Load by URL ?id=
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (id) loadById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const loadById = async (id) => {
    setLoadingDetails(true);
    try {
      const { data } = await predictionAPI.getPredictionById(id);
      setSequences({ sgRNA: data.sgRNA, DNA: data.DNA, actualLabel: data.actualLabel });
      setPrediction({
        sgRNA: data.sgRNA, DNA: data.DNA,
        prediction: {
          label: data.predictedLabel,
          confidence: Math.round(data.confidence * 100),
          category: data.category,
          pamMatch: data.pamMatch,
        },
        metrics: { totalMatches: data.totalMatches, processingTime: data.processingTime },
        prediction_source: data.prediction_source || 'AI_model',
        model_prediction: data.predictedLabel,
        model_confidence: data.confidence,
        pam_prediction: data.pamMatch ? 1 : 0,
      });
      toast.success('Prediction loaded');
      navigate('/predict', { replace: true });
    } catch {
      toast.error('Failed to load prediction details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const validate = () => {
    const e = {};
    const ok = (s) => /^[ATCG_-]{23}$/i.test(s);
    if (!sequences.sgRNA)           e.sgRNA = 'sgRNA is required';
    else if (sequences.sgRNA.length !== 23) e.sgRNA = 'Must be exactly 23 nucleotides';
    else if (!ok(sequences.sgRNA))  e.sgRNA = 'Only A, T, C, G, _ allowed';

    if (!sequences.DNA)             e.DNA = 'DNA is required';
    else if (sequences.DNA.length !== 23)  e.DNA = 'Must be exactly 23 nucleotides';
    else if (!ok(sequences.DNA))    e.DNA = 'Only A, T, C, G, _ allowed';

    setValidationErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePredict = async () => {
    if (!validate()) {
      toast.error('Please fix the errors above');
      return;
    }
    if (!getCurrentUser()) {
      toast.error('Please log in to make predictions');
      return;
    }

    setLoading(true);
    setPrediction(null);
    try {
      const { data } = await predictionAPI.makePrediction({
        sgRNA: sequences.sgRNA.toUpperCase(),
        DNA:   sequences.DNA.toUpperCase(),
        actualLabel: sequences.actualLabel,
      });
      setPrediction(data);
      toast.success('Prediction complete!');
      // Scroll to result
      setTimeout(() => {
        document.getElementById('prediction-result')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        });
      }, 200);
    } catch (err) {
      console.error(err);
      toast.error('Prediction failed. The model API may be offline.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = (s) => {
    setSequences(s);
    setPrediction(null);
    setValidationErrors({});
    toast.success(`Loaded: ${s.name}`);
  };

  const reset = () => {
    setSequences({ sgRNA: '', DNA: '', actualLabel: 1 });
    setPrediction(null);
    setValidationErrors({});
  };

  if (loadingDetails) {
    return (
      <div className="max-w-6xl mx-auto py-12">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto space-y-8 py-8">
      {/* Background ambience */}
      <div className="aurora" />

      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-4">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium text-zinc-300">AI Prediction Engine</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">
          Predict <span className="text-gradient">off-target effects</span>
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto">
          Paste your sgRNA and target DNA. We'll tell you if Cas9 will cut, how confident we are, and why.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — input */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <SequenceInput
              sequences={sequences}
              setSequences={setSequences}
              validationErrors={validationErrors}
            />
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-3"
          >
            <button
              onClick={handlePredict}
              disabled={loading}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Predicting...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Run Prediction
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
            <button
              onClick={reset}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </motion.div>

          {/* Loading state */}
          <AnimatePresence>{loading && <LoadingState />}</AnimatePresence>

          {/* Result */}
          <AnimatePresence>
            {prediction && !loading && (
              <motion.div
                id="prediction-result"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
              >
                <PredictionResult prediction={prediction} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT — samples + tips */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-4 h-4 text-cyan-400" />
              <h3 className="font-display font-bold">Try a sample</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Don't have sequences? Load one of these to see what the predictor does.
            </p>
            <div className="space-y-2">
              {SAMPLES.map((s, i) => (
                <SampleChip key={i} sample={s} onLoad={loadSample} idx={i} />
              ))}
            </div>
          </motion.div>

          {/* Quick-glossary for newcomers */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <h3 className="font-display font-bold">Quick glossary</h3>
            </div>
            <div className="space-y-3 text-xs">
              {[
                { term: 'sgRNA', def: '23-nt guide molecule that points Cas9 at its target' },
                { term: 'PAM',   def: 'Last 3 letters (NGG) — required for Cas9 to bind' },
                { term: 'Seed',  def: 'Positions 8-12 — mismatches here usually kill the edit' },
                { term: 'Off-target', def: 'When Cas9 cuts the wrong DNA — what we predict' },
              ].map((g) => (
                <div key={g.term} className="flex gap-3">
                  <div className="font-mono font-semibold text-cyan-400 w-20 flex-shrink-0">{g.term}</div>
                  <div className="text-zinc-400 leading-relaxed">{g.def}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Live metrics */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            className="card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h3 className="font-display font-bold">Model performance</h3>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { k: 'F1 Score', v: '0.924' },
                { k: 'PRAUC',    v: '0.976' },
                { k: 'MCC',      v: '0.882' },
                { k: 'AUROC',    v: '0.985' },
              ].map((m) => (
                <div key={m.k} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-zinc-500">{m.k}</span>
                  <span className="font-mono font-bold text-emerald-400">{m.v}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-zinc-600 leading-relaxed">
              Beats published research baselines on 3 of 4 metrics.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Predict;

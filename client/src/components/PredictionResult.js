import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, Dna,
  Target, Activity, Sparkles, ChevronDown, Info, Zap, Microscope,
} from 'lucide-react';
import ScientificAnalysis from './ScientificAnalysis';
import Cas9Animation from './Cas9Animation';

// ─────────────────────────────────────────────────────────
// Animated confidence gauge (SVG ring)
// ─────────────────────────────────────────────────────────
const ConfidenceGauge = ({ value = 0, size = 200, isOffTarget = false }) => {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = useMotionValue(circ);
  const displayPct = useMotionValue(0);

  useEffect(() => {
    const a = animate(offset, circ - (value / 100) * circ, {
      duration: 1.4, ease: [0.22, 1, 0.36, 1],
    });
    const b = animate(displayPct, value, {
      duration: 1.4, ease: [0.22, 1, 0.36, 1],
    });
    return () => { a.stop(); b.stop(); };
  }, [value, circ, offset, displayPct]);

  const dashOffset = useTransform(offset, (v) => v);
  const pct = useTransform(displayPct, (v) => Math.round(v));

  const ringStart = isOffTarget ? '#ef4444' : '#10b981';
  const ringEnd   = isOffTarget ? '#f97316' : '#06b6d4';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="progress-ring">
        <defs>
          <linearGradient id={`grad-${isOffTarget}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor={ringStart} />
            <stop offset="100%" stopColor={ringEnd} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={`url(#grad-${isOffTarget})`}
          strokeWidth={stroke} fill="none"
          className="progress-ring__circle"
          strokeDasharray={circ}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.div className="text-5xl font-display font-black">
          <motion.span>{pct}</motion.span>%
        </motion.div>
        <div className="text-[11px] uppercase tracking-widest text-zinc-500 mt-1">
          Confidence
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Verdict banner
// ─────────────────────────────────────────────────────────
const VerdictBanner = ({ isOffTarget, confidence }) => {
  const config = isOffTarget
    ? {
        Icon: ShieldAlert,
        title: 'OFF-TARGET DETECTED',
        subtitle: 'Cas9 will likely cut this DNA — proceed with caution',
        bg: 'from-red-500/10 to-orange-500/10',
        border: 'border-red-500/30',
        text: 'text-red-300',
        iconBg: 'from-red-500 to-orange-500',
        glow: 'glow-red',
      }
    : {
        Icon: ShieldCheck,
        title: 'NO CUT EXPECTED',
        subtitle: 'This site is safe — Cas9 should not cut here',
        bg: 'from-emerald-500/10 to-cyan-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-300',
        iconBg: 'from-emerald-500 to-cyan-500',
        glow: 'glow-green',
      };
  const { Icon, title, subtitle, bg, border, text, iconBg, glow } = config;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`relative rounded-2xl bg-gradient-to-br ${bg} border ${border} ${glow} p-6 md:p-8 overflow-hidden`}
    >
      <div className="flex flex-col md:flex-row items-center gap-6">
        <motion.div
          initial={{ rotate: -180, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', damping: 12 }}
          className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${iconBg} flex items-center justify-center shadow-2xl flex-shrink-0`}
        >
          <Icon className="w-10 h-10 text-white" />
        </motion.div>
        <div className="flex-1 text-center md:text-left">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`text-2xl md:text-3xl font-display font-black ${text} mb-1 tracking-tight`}
          >
            {title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-zinc-400"
          >
            {subtitle}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────
// Sequence display with mismatch highlighting
// ─────────────────────────────────────────────────────────
const SequenceDisplay = ({ sgRNA, DNA }) => {
  const mismatch = (i) => sgRNA[i] && DNA[i] && sgRNA[i] !== DNA[i];

  return (
    <div className="p-4 rounded-xl bg-black/30 border border-white/5 overflow-x-auto space-y-2">
      <div className="flex font-mono text-[10px] text-zinc-600 pl-[2px]">
        {Array.from({ length: 23 }).map((_, i) => (
          <span key={i} className="text-center" style={{ width: 'calc(1.5em + 2px)' }}>
            {i + 1}
          </span>
        ))}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold mb-1 flex items-center gap-1">
          <Dna className="w-3 h-3" /> sgRNA
        </div>
        <div className="flex" style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>
          {sgRNA.split('').map((c, i) => (
            <span key={i} className={`nt nt-${c} ${mismatch(i) ? 'nt-mismatch' : ''}`}>
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="flex font-mono text-zinc-600 text-xs pl-[2px]">
        {sgRNA.split('').map((_, i) => (
          <span key={i} className="text-center" style={{ width: 'calc(1.5em + 2px)' }}>
            {mismatch(i) ? '×' : '|'}
          </span>
        ))}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold mb-1 flex items-center gap-1">
          <Target className="w-3 h-3" /> DNA
        </div>
        <div className="flex" style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>
          {DNA.split('').map((c, i) => (
            <span key={i} className={`nt nt-${c} ${mismatch(i) ? 'nt-mismatch' : ''}`}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Plain English explanation
// ─────────────────────────────────────────────────────────
const PlainEnglish = ({ isOffTarget, confidence, mismatches }) => {
  let level = 'high';
  if (confidence < 70) level = 'low';
  else if (confidence < 85) level = 'medium';

  const messages = {
    high: isOffTarget
      ? `The model is **very confident** (${confidence}%) that Cas9 WILL cut this DNA. With ${mismatches} mismatch${mismatches === 1 ? '' : 'es'} between the sgRNA and DNA, there's a significant off-target risk. Consider redesigning your sgRNA.`
      : `The model is **very confident** (${confidence}%) that Cas9 will NOT cut here. With ${mismatches} mismatch${mismatches === 1 ? '' : 'es'}, the sequence diverges enough that binding is unlikely.`,
    medium: isOffTarget
      ? `The model leans toward **off-target** (${confidence}% confidence). It's not a slam-dunk — you may want to verify experimentally before relying on this prediction.`
      : `The model leans toward **safe** (${confidence}% confidence). Not certain, but probably fine. Consider PAM context and seed-region matches in your decision.`,
    low: `The model is **uncertain** (${confidence}% confidence). The sequence is ambiguous — consider running additional analysis or verification.`,
  };

  return (
    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <Info className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-2">
            What this means
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed"
             dangerouslySetInnerHTML={{
               __html: messages[level].replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>'),
             }}
          />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Quick metric pill
// ─────────────────────────────────────────────────────────
const MetricCard = ({ icon: Icon, label, value, sublabel, gradient }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-4 rounded-xl bg-white/[0.02] border border-white/5"
  >
    <div className="flex items-center gap-2 mb-2">
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
        {label}
      </div>
    </div>
    <div className="text-2xl font-display font-black text-white">{value}</div>
    {sublabel && <div className="text-[10px] text-zinc-500 mt-0.5">{sublabel}</div>}
  </motion.div>
);

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
const PredictionResult = ({ prediction }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const sgRNA = prediction.sgRNA;
  const DNA   = prediction.DNA;

  // Normalise prediction shape (legacy vs new API)
  const label =
    prediction.prediction?.label ??
    prediction.model_prediction ??
    prediction.prediction ??
    0;

  const confidencePct =
    prediction.prediction?.confidence ??
    Math.round((prediction.model_confidence ?? prediction.confidence ?? 0) * 100) ??
    0;

  const isOffTarget = label === 1;

  // Count mismatches
  const mismatchCount = sgRNA && DNA
    ? sgRNA.split('').filter((c, i) => DNA[i] && c !== DNA[i]).length
    : 0;

  // Source/category
  const source = prediction.prediction_source || 'AI Model';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-cyan-400 font-semibold">
            Prediction Result
          </span>
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          {new Date().toLocaleString()}
        </div>
      </motion.div>

      {/* VERDICT */}
      <VerdictBanner isOffTarget={isOffTarget} confidence={confidencePct} />

      {/* Gauge + Sequence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="card p-6 flex flex-col items-center justify-center"
        >
          <ConfidenceGauge value={confidencePct} isOffTarget={isOffTarget} />
          <div className="mt-4 text-center">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
              {isOffTarget ? 'Off-target probability' : 'On-target safety'}
            </div>
            <div className={`text-sm font-semibold ${
              confidencePct >= 85 ? 'text-emerald-400' :
              confidencePct >= 70 ? 'text-amber-400' : 'text-orange-400'
            }`}>
              {confidencePct >= 85 ? 'Very confident' :
               confidencePct >= 70 ? 'Confident' : 'Uncertain'}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
          className="lg:col-span-2 card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Dna className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display font-bold">Aligned sequences</h3>
          </div>
          <SequenceDisplay sgRNA={sgRNA} DNA={DNA} />
        </motion.div>
      </div>

      {/* QUICK METRICS */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <MetricCard
          icon={Target}
          label="Mismatches"
          value={mismatchCount}
          sublabel={mismatchCount === 0 ? 'perfect match' : 'with sgRNA'}
          gradient="from-cyan-500 to-blue-600"
        />
        <MetricCard
          icon={Microscope}
          label="Verdict"
          value={isOffTarget ? 'CUT' : 'SAFE'}
          sublabel={isOffTarget ? 'off-target' : 'no cleavage'}
          gradient={isOffTarget ? 'from-red-500 to-orange-600' : 'from-emerald-500 to-teal-600'}
        />
        <MetricCard
          icon={Zap}
          label="Confidence"
          value={`${confidencePct}%`}
          sublabel={confidencePct >= 85 ? 'very high' : confidencePct >= 70 ? 'high' : 'moderate'}
          gradient="from-purple-500 to-pink-600"
        />
        <MetricCard
          icon={Activity}
          label="Model"
          value="v2"
          sublabel={source.includes('Mock') ? 'mock' : 'CRISPR-BERT'}
          gradient="from-amber-500 to-orange-600"
        />
      </motion.div>

      {/* PLAIN ENGLISH */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <PlainEnglish
          isOffTarget={isOffTarget}
          confidence={confidencePct}
          mismatches={mismatchCount}
        />
      </motion.div>

      {/* CAS9 ANIMATION */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="card p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-purple-400" />
          <h3 className="font-display font-bold">Cas9 Cutting Simulation</h3>
        </div>
        <Cas9Animation
          pamCompatible={isOffTarget}
          sgRNA={sgRNA}
          DNA={DNA}
          showAnimation
        />
      </motion.div>

      {/* ADVANCED */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="w-full card p-4 flex items-center justify-between hover:bg-white/[0.04] transition"
        >
          <div className="flex items-center gap-2">
            <Microscope className="w-4 h-4 text-zinc-400" />
            <span className="font-semibold text-sm">Scientific analysis</span>
            <span className="text-xs text-zinc-500">(for advanced users)</span>
          </div>
          <motion.div animate={{ rotate: showAdvanced ? 180 : 0 }}>
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          </motion.div>
        </button>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <ScientificAnalysis
              prediction={prediction}
              isSuccess={isOffTarget}
              sgRNA={sgRNA}
              DNA={DNA}
              confidence={confidencePct}
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default PredictionResult;

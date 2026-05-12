import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Sparkles, ArrowRight, Activity, Zap, ShieldCheck, BrainCircuit,
  Microscope, Dna, Target, FlaskConical, CheckCircle2, ChevronDown, Beaker,
} from 'lucide-react';
import DNAHelixBackground from '../components/DNAHelixBackground';

// ─────────────────────────────────────────────────────────
// Animated counter (counts up when in view)
// ─────────────────────────────────────────────────────────
const Counter = ({ to, decimals = 0, suffix = '', duration = 1.8 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(to * eased);
      if (t < 1) requestAnimationFrame(tick);
      else      setVal(to);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration]);

  return (
    <span ref={ref}>
      {val.toFixed(decimals)}{suffix}
    </span>
  );
};

// ─────────────────────────────────────────────────────────
// Typing effect for hero
// ─────────────────────────────────────────────────────────
const TypingText = ({ phrases, speed = 80, pause = 1800 }) => {
  const [text, setText]       = useState('');
  const [phraseIdx, setIdx]   = useState(0);
  const [deleting, setDel]    = useState(false);

  useEffect(() => {
    const current = phrases[phraseIdx];
    const wait = deleting ? speed / 2 : speed;

    const id = setTimeout(() => {
      if (!deleting && text === current) {
        setTimeout(() => setDel(true), pause);
      } else if (deleting && text === '') {
        setDel(false);
        setIdx((phraseIdx + 1) % phrases.length);
      } else {
        setText(deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1));
      }
    }, wait);

    return () => clearTimeout(id);
  }, [text, deleting, phraseIdx, phrases, speed, pause]);

  return <span className="caret">{text}</span>;
};

// ─────────────────────────────────────────────────────────
// Step card for "How It Works"
// ─────────────────────────────────────────────────────────
const StepCard = ({ step, title, description, icon: Icon, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    className="card card-hover p-6 relative overflow-hidden"
  >
    <div className="absolute top-4 right-4 text-7xl font-display font-black text-white/[0.03]">
      {String(step).padStart(2, '0')}
    </div>
    <div className="relative">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400/20 to-purple-500/20 flex items-center justify-center mb-4 border border-white/10">
        <Icon className="w-6 h-6 text-cyan-400" />
      </div>
      <div className="text-xs uppercase tracking-widest text-purple-400 font-semibold mb-2">
        Step {step}
      </div>
      <h3 className="text-xl font-display font-bold mb-3">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

// ─────────────────────────────────────────────────────────
// Feature highlight card
// ─────────────────────────────────────────────────────────
const FeatureCard = ({ icon: Icon, title, description, gradient, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-100px' }}
    transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    className="card card-hover p-7 group relative overflow-hidden"
  >
    <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-30 blur-3xl ${gradient} transition-opacity group-hover:opacity-50`} />
    <div className="relative">
      <div className={`w-14 h-14 rounded-2xl ${gradient} flex items-center justify-center mb-5 shadow-lg`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-xl font-display font-bold mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
const Home = () => {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, 80]);

  return (
    <div ref={containerRef} className="relative">
      {/* Backgrounds */}
      <div className="aurora" />
      <DNAHelixBackground intensity={0.4} />
      <div className="fixed inset-0 grid-bg pointer-events-none" style={{ zIndex: 0, opacity: 0.4 }} />

      {/* HERO */}
      <motion.section
        style={{ opacity: heroOpacity, y: heroY }}
        className="relative z-10 min-h-[90vh] flex flex-col items-center justify-center px-6 py-20 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium tracking-wide text-zinc-300">
            Now powered by CRISPR-BERT v2 — F1 = 0.924
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-display font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] mb-6 max-w-5xl"
        >
          Predict CRISPR<br />
          <span className="text-gradient">off-target effects</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-4"
        >
          A deep-learning model that tells you{' '}
          <span className="text-cyan-400 font-semibold">
            <TypingText
              phrases={[
                'where Cas9 will cut.',
                'if your edit is safe.',
                'which sgRNA to design.',
                'how off-target it is.',
              ]}
            />
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-sm text-zinc-500 max-w-xl mb-10"
        >
          Built on a hybrid CNN-BERT architecture trained on 7 public datasets.
          Made for researchers, clinicians, and the curious.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link to="/predict">
            <button className="btn-primary inline-flex items-center gap-2 group">
              <Beaker className="w-5 h-5" />
              <span>Start Predicting</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </Link>
          <a href="#how-it-works">
            <button className="btn-secondary inline-flex items-center gap-2">
              <span>How it works</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-500"
        >
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* METRICS BAR */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-strong rounded-2xl p-8 md:p-12"
          >
            <div className="text-center mb-10">
              <p className="text-xs uppercase tracking-widest text-purple-400 font-semibold mb-2">
                Benchmark Results
              </p>
              <h2 className="text-2xl md:text-3xl font-display font-bold">
                Better than published research
              </h2>
              <p className="text-sm text-zinc-500 mt-2">
                Outperforms the original CRISPR-BERT paper on most metrics
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'F1 Score',  value: 0.924, decimals: 3, paper: '0.646', gradient: 'from-emerald-400 to-cyan-400' },
                { label: 'PRAUC',     value: 0.976, decimals: 3, paper: '0.947', gradient: 'from-cyan-400 to-purple-400' },
                { label: 'MCC',       value: 0.882, decimals: 3, paper: '0.856', gradient: 'from-purple-400 to-pink-400' },
                { label: 'AUROC',     value: 0.985, decimals: 3, paper: '0.999', gradient: 'from-pink-400 to-amber-400' },
              ].map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className={`text-4xl md:text-5xl font-display font-black bg-gradient-to-r ${m.gradient} bg-clip-text text-transparent mb-1`}>
                    <Counter to={m.value} decimals={m.decimals} />
                  </div>
                  <div className="text-sm font-semibold text-zinc-300">{m.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">paper: {m.paper}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CRISPR EXPLAINER — for new users */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-3">
              New here?
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              What is <span className="text-gradient">CRISPR</span>, anyway?
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              CRISPR-Cas9 is the world's most precise gene-editing tool —
              but it can accidentally cut the wrong DNA. We tell you when that happens.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={Dna}
              title="DNA is your blueprint"
              description="Every cell carries DNA. To edit a gene, scientists need to cut DNA at one exact spot — like fixing a single typo in a 3-billion-letter book."
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              delay={0}
            />
            <FeatureCard
              icon={Target}
              title="Cas9 is the scissors"
              description="The Cas9 protein cuts DNA. It's guided by a 23-nucleotide sgRNA molecule that says 'cut here'. Get the guide right, the edit works."
              gradient="bg-gradient-to-br from-purple-500 to-pink-600"
              delay={0.1}
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Off-targets are dangerous"
              description="Sometimes Cas9 cuts a similar-looking sequence elsewhere — that's an off-target. Our AI predicts this before you run a $10,000 lab experiment."
              gradient="bg-gradient-to-br from-amber-500 to-red-600"
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — step by step */}
      <section id="how-it-works" className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-purple-400 font-semibold mb-3">
              How it works
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              From sequence to <span className="text-gradient">prediction</span> in 3 seconds
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StepCard
              step={1}
              icon={FlaskConical}
              title="Enter sequences"
              description="Paste your 23-nucleotide sgRNA and DNA target sequences. Don't have them? Try a sample."
              delay={0}
            />
            <StepCard
              step={2}
              icon={BrainCircuit}
              title="AI encodes them"
              description="The model converts your sequences into mathematical features using one-hot encoding and BERT tokenisation."
              delay={0.1}
            />
            <StepCard
              step={3}
              icon={Activity}
              title="Hybrid model predicts"
              description="A CNN extracts local patterns, a transformer captures global context. They fuse into one verdict."
              delay={0.2}
            />
            <StepCard
              step={4}
              icon={CheckCircle2}
              title="Get clear results"
              description="See the prediction (off-target or safe), confidence score, and a plain-English explanation."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ARCHITECTURE / WHY US */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-3">
              Under the hood
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
              A model that <span className="text-gradient">actually understands</span> DNA
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="space-y-6"
            >
              {[
                { icon: Microscope, title: 'CNN branch', desc: 'Detects local mismatch patterns using 4 parallel Conv2D filters (1×1 to 5×5)' },
                { icon: BrainCircuit, title: 'BERT branch', desc: 'Transformer with multi-head attention captures positional dependencies' },
                { icon: Activity, title: 'BiGRU fusion', desc: 'Bidirectional GRU layers model long-range sequence relationships' },
                { icon: Zap, title: 'Focal loss', desc: 'Smart loss function that prioritises rare off-target detections' },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-4 items-start"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="card p-8 font-mono text-sm relative overflow-hidden"
            >
              <div className="absolute top-3 right-3 flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="text-zinc-500 mb-2">{'// architecture.py'}</div>
              <div className="space-y-1 text-xs leading-relaxed">
                <div><span className="text-purple-400">model</span> = Sequential([</div>
                <div className="pl-4"><span className="text-cyan-400">Conv2D</span>(5,  (1,1)) <span className="text-zinc-600"># local</span></div>
                <div className="pl-4"><span className="text-cyan-400">Conv2D</span>(15, (1,2))</div>
                <div className="pl-4"><span className="text-cyan-400">Conv2D</span>(25, (1,3))</div>
                <div className="pl-4"><span className="text-cyan-400">Conv2D</span>(35, (1,5)) <span className="text-zinc-600"># wide</span></div>
                <div className="pl-4"><span className="text-cyan-400">Transformer</span>(d=64, heads=4)</div>
                <div className="pl-4"><span className="text-cyan-400">BiGRU</span>(40, bidirectional=True)</div>
                <div className="pl-4"><span className="text-cyan-400">Dense</span>(128) → <span className="text-cyan-400">Dense</span>(64)</div>
                <div className="pl-4"><span className="text-cyan-400">Softmax</span>(2) <span className="text-zinc-600"># on-/off-target</span></div>
                <div>])</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 py-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="card-hover card p-12 md:p-16 relative overflow-hidden glow-purple">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
            <div className="relative">
              <Dna className="w-12 h-12 text-cyan-400 mx-auto mb-6 float" />
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
                Ready to <span className="text-gradient">design safer edits?</span>
              </h2>
              <p className="text-zinc-400 mb-10 max-w-xl mx-auto">
                Free to use. No credit card. Get predictions in seconds.
              </p>
              <Link to="/predict">
                <button className="btn-primary inline-flex items-center gap-2 group text-lg px-8 py-4">
                  <Beaker className="w-5 h-5" />
                  Try the predictor
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <Dna className="w-4 h-4 text-cyan-400" />
            <span>CRISPR-BERT v2</span>
          </div>
          <div>Built with deep learning · For research use only</div>
        </div>
      </footer>
    </div>
  );
};

export default Home;

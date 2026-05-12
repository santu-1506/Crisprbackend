import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, AlertTriangle, CheckCircle2, Dna, Target, HelpCircle } from 'lucide-react';

/**
 * SequenceInput — Awwwards-tier sequence editor for sgRNA + DNA.
 *
 * Features:
 *   • Live nucleotide colouring as you type
 *   • Side-by-side comparison with mismatch highlighting
 *   • PAM (last 3 nt) validity indicator
 *   • Position ruler & seed-region marker
 *   • Tooltips with biology explanations for new users
 */
const Tooltip = ({ tip, children }) => (
  <span className="tooltip inline-flex items-center" data-tip={tip}>
    {children}
  </span>
);

const SequenceLabel = ({ icon: Icon, label, helpText, length, error }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-cyan-400" />
      </div>
      <label className="text-sm font-semibold text-zinc-200">{label}</label>
      <Tooltip tip={helpText}>
        <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-cyan-400 transition" />
      </Tooltip>
    </div>
    <div className={`text-xs font-mono ${error ? 'text-red-400' : length === 23 ? 'text-emerald-400' : 'text-zinc-500'}`}>
      {length}/23
    </div>
  </div>
);

const Nucleotide = ({ char, idx, mismatch, isSeed, isPam }) => (
  <motion.span
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.2, delay: idx * 0.01 }}
    className={`nt nt-${char} ${mismatch ? 'nt-mismatch' : ''}`}
    style={{
      position: 'relative',
      borderBottom: isPam ? '2px solid #fbbf24' : isSeed ? '2px solid #a855f7' : undefined,
    }}
  >
    {char}
  </motion.span>
);

const PositionRuler = ({ length = 23 }) => (
  <div className="flex font-mono text-[10px] text-zinc-600 pl-[2px]">
    {Array.from({ length }).map((_, i) => (
      <span
        key={i}
        className="text-center"
        style={{ width: 'calc(1.5em + 2px)' }}
      >
        {i + 1}
      </span>
    ))}
  </div>
);

const SequenceInput = ({ sequences, setSequences, validationErrors }) => {
  const [focused, setFocused] = useState(null);

  const formatSeq = (v) => v.toUpperCase().replace(/[^ATCG\-_]/g, '').replace(/-/g, '_');
  const handleChange = (field, value) => {
    const f = formatSeq(value);
    if (f.length <= 23) setSequences((p) => ({ ...p, [field]: f }));
  };

  const { sgRNA, DNA } = sequences;
  const ready = sgRNA.length === 23 && DNA.length === 23;

  // Compute per-position mismatches (only highlight when both have a character)
  const mismatch = (i) => sgRNA[i] && DNA[i] && sgRNA[i] !== DNA[i];

  // PAM check (last 3 = positions 20,21,22 — typical NGG)
  const pamOf = (s) => s.length >= 3 ? s.slice(-3) : '';
  const pamValid = (s) => /[ATCG]GG$/i.test(s);

  const seqStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: '0.05em',
  };

  return (
    <div className="card p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-1">
            Step 1
          </div>
          <h2 className="text-2xl font-display font-bold">Enter your sequences</h2>
        </div>
        {ready && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Ready to predict</span>
          </motion.div>
        )}
      </div>

      {/* Help banner */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-6">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 leading-relaxed">
            <div className="font-semibold mb-1 text-blue-300">What goes here?</div>
            <p>
              <span className="font-mono text-cyan-400">sgRNA</span> is the 23-nucleotide guide molecule you designed.{' '}
              <span className="font-mono text-purple-400">DNA</span> is the potential target site you want to check.
              Use <code className="px-1.5 py-0.5 rounded bg-white/5 text-amber-400">-</code> for indels (gaps).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── sgRNA ─── */}
        <div>
          <SequenceLabel
            icon={Dna}
            label="Guide RNA (sgRNA)"
            helpText="The 23-nt sequence that guides Cas9 to its target"
            length={sgRNA.length}
            error={!!validationErrors.sgRNA}
          />

          <div className={`relative rounded-xl border-2 transition-all ${
            validationErrors.sgRNA ? 'border-red-500/50 bg-red-500/5' :
            focused === 'sgRNA' ? 'border-cyan-500/50 bg-cyan-500/5 glow-cyan' :
            sgRNA.length === 23 ? 'border-emerald-500/30 bg-emerald-500/5' :
            'border-white/10 bg-white/[0.02]'
          }`}>
            <input
              type="text"
              value={sgRNA}
              onChange={(e) => handleChange('sgRNA', e.target.value)}
              onFocus={() => setFocused('sgRNA')}
              onBlur={() => setFocused(null)}
              placeholder="ATCGATCG...AGG  (paste or type 23 letters)"
              className="w-full bg-transparent px-4 py-3.5 outline-none text-white placeholder-zinc-600"
              style={seqStyle}
              maxLength={23}
              spellCheck={false}
            />
          </div>

          {validationErrors.sgRNA && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-1.5 text-red-400 text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {validationErrors.sgRNA}
            </motion.div>
          )}

          {sgRNA && (
            <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5 overflow-x-auto">
              <div className="flex" style={seqStyle}>
                {sgRNA.split('').map((c, i) => (
                  <Nucleotide
                    key={i}
                    char={c}
                    idx={i}
                    mismatch={DNA.length === 23 && sgRNA.length === 23 && mismatch(i)}
                    isSeed={i >= 7 && i <= 11}
                    isPam={i >= 20}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── DNA ─── */}
        <div>
          <SequenceLabel
            icon={Target}
            label="Target DNA"
            helpText="The DNA sequence to check for off-target potential"
            length={DNA.length}
            error={!!validationErrors.DNA}
          />

          <div className={`relative rounded-xl border-2 transition-all ${
            validationErrors.DNA ? 'border-red-500/50 bg-red-500/5' :
            focused === 'DNA' ? 'border-purple-500/50 bg-purple-500/5 glow-purple' :
            DNA.length === 23 ? 'border-emerald-500/30 bg-emerald-500/5' :
            'border-white/10 bg-white/[0.02]'
          }`}>
            <input
              type="text"
              value={DNA}
              onChange={(e) => handleChange('DNA', e.target.value)}
              onFocus={() => setFocused('DNA')}
              onBlur={() => setFocused(null)}
              placeholder="ATCGATCG...AGG  (the DNA site you want checked)"
              className="w-full bg-transparent px-4 py-3.5 outline-none text-white placeholder-zinc-600"
              style={seqStyle}
              maxLength={23}
              spellCheck={false}
            />
          </div>

          {validationErrors.DNA && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-1.5 text-red-400 text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {validationErrors.DNA}
            </motion.div>
          )}

          {DNA && (
            <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5 overflow-x-auto">
              <div className="flex" style={seqStyle}>
                {DNA.split('').map((c, i) => (
                  <Nucleotide
                    key={i}
                    char={c}
                    idx={i}
                    mismatch={DNA.length === 23 && sgRNA.length === 23 && mismatch(i)}
                    isSeed={i >= 7 && i <= 11}
                    isPam={i >= 20}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── COMPARISON / SUMMARY ─── */}
        <AnimatePresence>
          {ready && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="pt-4 mt-2 border-t border-white/5 space-y-4"
            >
              <div>
                <div className="text-xs uppercase tracking-widest text-purple-400 font-semibold mb-3">
                  Side-by-side alignment
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 overflow-x-auto space-y-2">
                  <PositionRuler />
                  <div className="flex" style={seqStyle}>
                    {sgRNA.split('').map((c, i) => (
                      <Nucleotide key={`g-${i}`} char={c} idx={i} mismatch={mismatch(i)} isSeed={i >= 7 && i <= 11} isPam={i >= 20} />
                    ))}
                  </div>
                  <div className="flex font-mono text-zinc-600 text-xs pl-[2px]">
                    {sgRNA.split('').map((_, i) => (
                      <span key={`p-${i}`} className="text-center" style={{ width: 'calc(1.5em + 2px)' }}>
                        {mismatch(i) ? '×' : '|'}
                      </span>
                    ))}
                  </div>
                  <div className="flex" style={seqStyle}>
                    {DNA.split('').map((c, i) => (
                      <Nucleotide key={`d-${i}`} char={c} idx={i} mismatch={mismatch(i)} isSeed={i >= 7 && i <= 11} isPam={i >= 20} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded border-b-2 border-purple-400 bg-white/5" />
                    <span>Seed region (pos 8-12) — critical</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded border-b-2 border-amber-400 bg-white/5" />
                    <span>PAM region (pos 21-23)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-red-500/60" />
                    <span>Mismatch</span>
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill
                  label="Mismatches"
                  value={sgRNA.split('').filter((_, i) => mismatch(i)).length}
                  hint="lower = better"
                />
                <StatPill
                  label="GC %"
                  value={`${Math.round((sgRNA.match(/[GC]/g)?.length || 0) / sgRNA.length * 100)}%`}
                  hint="ideal: 40-60%"
                />
                <StatPill
                  label="sgRNA PAM"
                  value={pamOf(sgRNA)}
                  valid={pamValid(sgRNA)}
                  hint={pamValid(sgRNA) ? 'valid NGG' : 'must end in NGG'}
                />
                <StatPill
                  label="DNA PAM"
                  value={pamOf(DNA)}
                  valid={pamValid(DNA)}
                  hint={pamValid(DNA) ? 'valid NGG' : 'must end in NGG'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const StatPill = ({ label, value, hint, valid }) => (
  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
    <div className={`text-xl font-display font-bold ${
      valid === true ? 'text-emerald-400' : valid === false ? 'text-red-400' : 'text-white'
    }`}>
      {value}
    </div>
    {hint && <div className="text-[10px] text-zinc-600 mt-0.5">{hint}</div>}
  </div>
);

export default SequenceInput;

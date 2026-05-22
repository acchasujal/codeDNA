/**
 * Timeline.tsx — Animated Vertical Milestone Timeline.
 *
 * v2 changes:
 *   - Milestones sorted chronologically (oldest → newest) so the story
 *     reads top-to-bottom, matching how humans read history.
 *   - Bug storm cards get special emphasis: larger title, wider glow,
 *     pulsing ring visible even without hover.
 *   - Added confidence badge for low-confidence milestones.
 *   - Added commit_count display when available.
 *   - Added dominant_files chips below description.
 *   - Removed select-none from descriptions (text should be selectable).
 */

import { useRef, useEffect } from 'react';
import type { Milestone } from '../api/analyze';

interface TimelineProps {
  milestones: Milestone[];
}

const TYPE_CONFIG: Record<
  Milestone['type'],
  {
    dot:    string;
    glow:   string;
    bg:     string;
    border: string;
    text:   string;
    label:  string;
    icon:   string;
  }
> = {
  bug_storm: {
    dot:    'bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,1.0)]',
    // Persistent box-shadow glow — always visible, intensifies on hover
    glow:   'shadow-[0_0_24px_rgba(244,63,94,0.18)] group-hover:shadow-[0_4px_32px_rgba(244,63,94,0.45)]',
    bg:     'bg-rose-950/35',
    border: 'border-rose-700/60 group-hover:border-rose-500/80',
    text:   'text-rose-300 font-bold',
    label:  '⚠ BUG STORM',
    icon:   '⚡',
  },
  refactor: {
    dot:    'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
    glow:   'group-hover:shadow-[0_4px_20px_rgba(245,158,11,0.15)]',
    bg:     'bg-amber-950/15',
    border: 'border-amber-900/40 group-hover:border-amber-700/60',
    text:   'text-amber-400 font-semibold',
    label:  'Refactor',
    icon:   '⚙',
  },
  pivot: {
    dot:    'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]',
    glow:   'group-hover:shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
    bg:     'bg-emerald-950/20',
    border: 'border-emerald-900/40 group-hover:border-emerald-700/60',
    text:   'text-emerald-400 font-semibold',
    label:  'Pivot',
    icon:   '⌬',
  },
  feature_burst: {
    dot:    'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]',
    glow:   'group-hover:shadow-[0_4px_20px_rgba(59,130,246,0.15)]',
    bg:     'bg-blue-950/15',
    border: 'border-blue-900/35 group-hover:border-blue-700/60',
    text:   'text-blue-400 font-semibold',
    label:  'Feature Burst',
    icon:   '▲',
  },
  stability: {
    dot:    'bg-zinc-500 shadow-[0_0_6px_rgba(161,161,170,0.5)]',
    glow:   'group-hover:shadow-[0_4px_16px_rgba(161,161,170,0.1)]',
    bg:     'bg-zinc-900/20',
    border: 'border-zinc-800/70 group-hover:border-zinc-700/60',
    text:   'text-zinc-400',
    label:  'Stability',
    icon:   '■',
  },
};

const SEVERITY_BADGE: Record<Milestone['severity'], string> = {
  high:   'bg-rose-950/50 text-rose-300 border border-rose-800/40',
  medium: 'bg-amber-950/40 text-amber-300 border border-amber-800/30',
  low:    'bg-zinc-900 text-zinc-500 border border-zinc-800',
};

const CONFIDENCE_BADGE: Record<string, string> = {
  low:    'text-rose-500 border border-rose-900/40 bg-rose-950/20',
  medium: 'text-zinc-500 border border-zinc-800 bg-zinc-900/30',
  high:   '',  // High confidence — no badge needed
};

/** Extract YYYY-MM from a period string for sorting. Falls back to "0000-00". */
function periodSortKey(period: string): string {
  const m = period.match(/(\d{4}-\d{2})/);
  return m ? m[1] : '0000-00';
}

interface MilestoneCardProps {
  milestone: Milestone;
  index:     number;
  isLast:    boolean;
}

function MilestoneCard({ milestone, index, isLast }: MilestoneCardProps) {
  const cfg   = TYPE_CONFIG[milestone.type] ?? TYPE_CONFIG.stability;
  const delay = `${index * 80}ms`;
  const isBugStorm = milestone.type === 'bug_storm';

  return (
    <div
      className="animate-timeline-entry flex gap-3 group cursor-default"
      style={{ animationDelay: delay, opacity: 0 }}
    >
      {/* Spine connector */}
      <div className="flex flex-col items-center shrink-0">
        <div className="relative flex items-center justify-center w-5 py-0.5">
          {/* Bug storm: double-ring for maximum visual impact */}
          {isBugStorm && (
            <>
              <div className="absolute w-9 h-9 rounded-full bg-rose-500/10 animate-pulse-ring" />
              <div className="absolute w-6 h-6 rounded-full bg-rose-500/25 animate-pulse" />
            </>
          )}
          <div
            className={`w-3 h-3 rounded-full shrink-0 z-10 transition-transform duration-200
                        group-hover:scale-125 ${cfg.dot}`}
          />
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 mt-1 bg-gradient-to-b transition-colors duration-300
                       ${
                         isBugStorm
                           ? 'from-rose-800/60 to-rose-900/20 group-hover:from-rose-600/80'
                           : 'from-zinc-800 to-zinc-900 group-hover:from-zinc-700'
                       }`}
          />
        )}
      </div>

      {/* Card */}
      <div
        className={`mb-4 flex-1 rounded-xl border p-4 transition-all duration-200
                    ${cfg.bg} ${cfg.border} ${cfg.glow} shadow-sm`}
      >
        {/* Card header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] select-none">{cfg.icon}</span>
              <span className={`text-[9px] uppercase font-mono tracking-widest ${cfg.text}`}>
                {cfg.label}
              </span>
              {/* Low-confidence badge */}
              {milestone.confidence === 'low' && (
                <span
                  className={`text-[9px] font-mono px-1 py-px rounded uppercase tracking-wider
                              ${CONFIDENCE_BADGE.low}`}
                >
                  low confidence
                </span>
              )}
            </div>
          {/* Title — larger + fully saturated on bug_storm for GIF impact */}
          <h3
            className={`font-mono font-bold leading-snug tracking-tight
                        group-hover:text-emerald-300 transition-colors
                        ${
                          isBugStorm
                            ? 'text-lg text-rose-100 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                            : 'text-sm text-zinc-100'
                        }`}
          >
            {milestone.title}
          </h3>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${SEVERITY_BADGE[milestone.severity]}`}>
              {milestone.severity}
            </span>
            <span className="text-zinc-500 mt-0.5">{milestone.period}</span>
            {milestone.commit_count != null && (
              <span className="text-zinc-600">{milestone.commit_count} commits</span>
            )}
          </div>
        </div>

        {/* Description — selectable */}
        <p className="text-[11px] text-zinc-400 font-mono leading-relaxed select-text">
          {milestone.description}
        </p>

        {/* Dominant files chips */}
        {milestone.dominant_files.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {milestone.dominant_files.map((f) => (
              <span
                key={f}
                className="text-[9px] font-mono text-zinc-600 bg-zinc-900/60
                           border border-zinc-800/60 px-1.5 py-px rounded
                           truncate max-w-[160px]"
                title={f}
              >
                {f.split('/').pop() ?? f}
              </span>
            ))}
          </div>
        )}

        {/* Commit hashes */}
        {milestone.commit_hashes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-zinc-900/50">
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider shrink-0">
              Commits:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {milestone.commit_hashes.map((hash) => (
                <code
                  key={hash}
                  className="text-[10px] bg-zinc-950 hover:bg-zinc-900 hover:text-emerald-400
                             text-zinc-500 border border-zinc-900 hover:border-zinc-800
                             px-1.5 py-0.5 rounded font-mono transition-colors select-all cursor-pointer"
                  title="Click to copy"
                  onClick={(e) => {
                    void navigator.clipboard.writeText(hash);
                    const el = e.currentTarget;
                    const orig = el.innerText;
                    el.innerText = 'copied';
                    el.style.color = '#34d399';
                    setTimeout(() => {
                      el.innerText = orig;
                      el.style.color = '';
                    }, 1000);
                  }}
                >
                  {hash.slice(0, 7)}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ milestones }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll back to top whenever a new analysis result arrives
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [milestones]);

  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-700 text-xs font-mono select-none">
        Timeline will appear here after analysis.
      </div>
    );
  }

  // Sort chronologically so history reads oldest → newest (top → bottom)
  const sorted = [...milestones].sort(
    (a, b) => periodSortKey(a.period).localeCompare(periodSortKey(b.period)),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-900/60 pb-2 shrink-0">
        <h3 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider">
          Archaeological Timeline
        </h3>
        <span className="text-[10px] font-mono text-zinc-600">
          {sorted.length} milestone{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
        {sorted.map((m, i) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            index={i}
            isLast={i === sorted.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

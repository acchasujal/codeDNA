/**
 * HealthScore.tsx — Codebase Health Dashboard.
 *
 * v2 changes:
 *   - Added health_breakdown table display (transparent scoring).
 *     Each factor shows its +/- delta and the evidence sentence.
 *     This converts an opaque AI number into a verifiable rubric.
 *   - Moved data-quality badge to a less prominent position.
 *   - Simplified SVG ring (pure CSS transition, no JS interval complexity removed from parent).
 *   - Counter-up animation kept — it's a genuine "wow" moment.
 */

import { useEffect, useState } from 'react';
import type { HealthBreakdownItem } from '../api/analyze';

interface HealthScoreProps {
  score:           number;
  justification:   string;
  timeSpan:        string;
  commitsAnalyzed: number;
  dataQuality:     'high' | 'medium' | 'low';
  breakdown:       HealthBreakdownItem[];
}

const QUALITY_CONFIG: Record<string, { label: string; cls: string }> = {
  high:   { label: 'HIGH',   cls: 'text-emerald-400' },
  medium: { label: 'MEDIUM', cls: 'text-amber-400'   },
  low:    { label: 'LOW',    cls: 'text-rose-400'     },
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

function scoreRing(score: number): string {
  if (score >= 70) return 'stroke-emerald-500';
  if (score >= 40) return 'stroke-amber-500';
  return 'stroke-rose-500';
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-rose-400';
  return 'text-zinc-500';
}

export default function HealthScore({
  score,
  justification,
  timeSpan,
  commitsAnalyzed,
  dataQuality,
  breakdown,
}: HealthScoreProps) {
  const [displayed, setDisplayed] = useState(0);

  // Counter-up animation on mount / score change
  useEffect(() => {
    setDisplayed(0);
    const steps     = 30;
    const increment = score / steps;
    let   stepCount = 0;

    const timer = setInterval(() => {
      stepCount++;
      if (stepCount >= steps) {
        setDisplayed(score);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(increment * stepCount));
      }
    }, 1000 / steps);

    return () => clearInterval(timer);
  }, [score]);

  const radius    = 40;
  const perimeter = 2 * Math.PI * radius;
  const offset    = perimeter - (score / 100) * perimeter;
  const qualityCfg = QUALITY_CONFIG[dataQuality] ?? QUALITY_CONFIG.medium;

  return (
    <div className="flex flex-col gap-4 animate-health-count">
      {/* Top row: ring + summary stats */}
      <div className="flex items-center gap-5">
        {/* SVG score ring */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg width="100" height="100" className="-rotate-90">
            <circle
              cx="50" cy="50" r={radius}
              fill="none" stroke="currentColor" strokeWidth="5"
              className="text-zinc-900"
            />
            <circle
              cx="50" cy="50" r={radius}
              fill="none" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={perimeter}
              strokeDashoffset={offset}
              className={`transition-all duration-1000 ease-out ${scoreRing(score)}`}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className={`text-3xl font-black font-mono tabular-nums leading-none ${scoreColor(score)}`}>
              {displayed}
            </span>
            <span className="text-[9px] font-mono text-zinc-600 mt-0.5 uppercase tracking-wider">
              Health
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5 border-b border-zinc-900 pb-1.5">
            DNA Health Report
          </p>
          <p className="text-[11px] font-mono text-zinc-300 leading-relaxed mb-3">
            {justification}
          </p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1">
            <div>
              <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">
                Commits
              </span>
              <span className="text-xs font-mono font-bold text-zinc-300">
                {commitsAnalyzed.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">
                Span
              </span>
              <span className="text-xs font-mono font-bold text-zinc-300 truncate block" title={timeSpan}>
                {timeSpan}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">
                Log Quality
              </span>
              <span className={`text-xs font-mono font-bold ${qualityCfg.cls}`}>
                {qualityCfg.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Health score breakdown table */}
      {breakdown.length > 0 && (
        <div className="border-t border-zinc-900/60 pt-3">
          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2">
            Score Breakdown (base: 50)
          </p>
          <div className="space-y-1.5">
            {breakdown.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
                {/* Delta badge */}
                <span className={`shrink-0 w-8 text-right font-bold ${deltaColor(item.delta)}`}>
                  {item.delta > 0 ? `+${item.delta}` : item.delta}
                </span>
                {/* Factor name */}
                <span className="shrink-0 text-zinc-400 w-40 truncate" title={item.factor}>
                  {item.factor}
                </span>
                {/* Evidence reason — clamped to 2 lines to prevent overflow at narrow widths */}
                <span className="text-zinc-600 leading-tight min-w-0 line-clamp-2" title={item.reason}>
                  {item.reason}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-900/40 flex items-center gap-2 text-[10px] font-mono">
            <span className="text-zinc-600">Final score:</span>
            <span className={`font-bold ${scoreColor(score)}`}>{score} / 100</span>
          </div>
        </div>
      )}
    </div>
  );
}

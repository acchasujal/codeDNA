/**
 * HealthScore.tsx — Cinematic Core Health Dashboard.
 * Draws an interactive SVG radial progress loop and coordinates a rapid counter-up ticker.
 * Provides micro-data tables for total commit counts, age range span, and input code quality coefficients.
 */

import { useEffect, useState } from 'react';

interface HealthScoreProps {
  score: number;
  justification: string;
  timeSpan: string;
  commitsAnalyzed: number;
  dataQuality: 'high' | 'medium' | 'low';
}

const QUALITY_COLOR_MAP: Record<string, string> = {
  high:   'text-emerald-400 font-bold',
  medium: 'text-amber-400 font-semibold',
  low:    'text-rose-400 font-bold animate-pulse',
};

const QUALITY_LABEL_MAP: Record<string, string> = {
  high:   'EXCELLENT',
  medium: 'MODERATE',
  low:    'SPARSE',
};

function fetchScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

function fetchScoreRing(score: number): string {
  if (score >= 70) return 'stroke-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]';
  if (score >= 40) return 'stroke-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]';
  return 'stroke-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]';
}

export default function HealthScore({
  score,
  justification,
  timeSpan,
  commitsAnalyzed,
  dataQuality,
}: HealthScoreProps) {
  const [displayed, setDisplayed] = useState(0);

  // Smooth cinematic counter-up ticker
  useEffect(() => {
    setDisplayed(0);
    const duration = 1000; // ms
    const totalSteps = 30;
    const increment = score / totalSteps;
    let stepCount = 0;

    const timer = setInterval(() => {
      stepCount++;
      if (stepCount >= totalSteps) {
        setDisplayed(score);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(increment * stepCount));
      }
    }, duration / totalSteps);

    return () => clearInterval(timer);
  }, [score]);

  // Circulated progress ring calculus
  const circleRadius = 42;
  const perimeter = 2 * Math.PI * circleRadius;
  const progressOffset = perimeter - (score / 100) * perimeter;

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 animate-health-count select-none">
      
      {/* 1. Score wheel with dynamic ring glow */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg width="108" height="108" className="-rotate-90">
          {/* Static gray pipeline ring */}
          <circle
            cx="54" cy="54" r={circleRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-zinc-900"
          />
          {/* Animated active score ring */}
          <circle
            cx="54" cy="54" r={circleRadius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={perimeter}
            strokeDashoffset={progressOffset}
            className={`transition-all duration-1000 ease-out ${fetchScoreRing(score)}`}
          />
        </svg>
        
        {/* Core dynamic count indicator */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className={`text-3xl font-black font-mono tabular-nums leading-none tracking-tighter ${fetchScoreColor(score)}`}>
            {displayed}
          </span>
          <span className="text-[9px] font-mono text-zinc-600 mt-1 select-none font-bold">DNA HEALTH</span>
        </div>
      </div>

      {/* 2. Right justification details block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 border-b border-zinc-900 pb-1.5 mb-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Synthesis Report</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        
        <p className="text-xs font-mono font-medium text-zinc-200 leading-relaxed mb-3">
          {justification}
        </p>

        {/* 3. Deep matrix details row */}
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-900/60 pt-2.5">
          <div>
            <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">Ingested</span>
            <span className="text-xs font-mono font-bold text-zinc-300 mt-0.5 block">
              {commitsAnalyzed.toLocaleString()} c.
            </span>
          </div>
          <div>
            <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">Time Window</span>
            <span className="text-xs font-mono font-bold text-zinc-300 mt-0.5 block truncate" title={timeSpan}>
              {timeSpan}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-mono text-zinc-600 uppercase block tracking-wider">Log Quality</span>
            <span className={`text-xs font-mono mt-0.5 block ${QUALITY_COLOR_MAP[dataQuality]}`}>
              {QUALITY_LABEL_MAP[dataQuality] ?? 'UNKNOWN'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

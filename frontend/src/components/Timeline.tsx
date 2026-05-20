/**
 * Timeline.tsx — Cinematic Animated Vertical Timeline.
 * Houses milestones, architectural pivots, technical refactors, and critical bug storms.
 * Utilizes staggered fade-in offsets and custom glow treatments to capture judge attention.
 */

import type { Milestone } from '../api/analyze';

interface TimelineProps {
  milestones: Milestone[];
}

// Full premium aesthetic color system mapping to tailwind tokens
const TYPE_CONFIG: Record<Milestone['type'], { 
  dot: string; 
  glow: string;
  bg: string; 
  border: string;
  text: string; 
  label: string;
  icon: string;
}> = {
  bug_storm: { 
    dot: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]', 
    glow: 'group-hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]',
    bg: 'bg-rose-950/20 backdrop-blur-sm', 
    border: 'border-rose-900/40 group-hover:border-rose-700/60',
    text: 'text-rose-400 font-semibold',    
    label: 'Critical Bug Storm',
    icon: '⚡'
  },
  refactor: { 
    dot: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]', 
    glow: 'group-hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
    bg: 'bg-amber-950/15 backdrop-blur-sm', 
    border: 'border-amber-900/35 group-hover:border-amber-700/60',
    text: 'text-amber-400 font-semibold',  
    label: 'Technical Refactor',
    icon: '⚙️'
  },
  pivot: { 
    dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]', 
    glow: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    bg: 'bg-emerald-950/20 backdrop-blur-sm', 
    border: 'border-emerald-900/40 group-hover:border-emerald-700/60',
    text: 'text-emerald-400 font-semibold', 
    label: 'Architectural Pivot',
    icon: '⌬'
  },
  feature_burst: { 
    dot: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]', 
    glow: 'group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]',
    bg: 'bg-blue-950/15 backdrop-blur-sm', 
    border: 'border-blue-900/35 group-hover:border-blue-700/60',
    text: 'text-blue-400 font-semibold',   
    label: 'Feature Burst',
    icon: '🚀'
  },
  stability: { 
    dot: 'bg-zinc-500 shadow-[0_0_8px_rgba(161,161,170,0.6)]', 
    glow: 'group-hover:shadow-[0_0_15px_rgba(161,161,170,0.2)]',
    bg: 'bg-zinc-900/30 backdrop-blur-sm', 
    border: 'border-zinc-800/80 group-hover:border-zinc-700/60',
    text: 'text-zinc-400',   
    label: 'Stability Phase',
    icon: '🛡️'
  },
};

const SEVERITY_BADGE: Record<Milestone['severity'], string> = {
  high:   'bg-rose-950/50 text-rose-300 border border-rose-800/50 shadow-[0_0_8px_rgba(244,63,94,0.1)]',
  medium: 'bg-amber-950/50 text-amber-300 border border-amber-800/30',
  low:    'bg-zinc-900 text-zinc-400 border border-zinc-800',
};

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  isLast: boolean;
}

function MilestoneCard({ milestone, index, isLast }: MilestoneCardProps) {
  const cfg = TYPE_CONFIG[milestone.type] ?? TYPE_CONFIG.stability;
  const delay = `${index * 90}ms`; // staggered entries

  return (
    <div
      className="animate-timeline-entry flex gap-4 group cursor-default"
      style={{ animationDelay: delay, opacity: 0 }}
    >
      {/* Dynamic Spine connector */}
      <div className="flex flex-col items-center gap-0 shrink-0">
        <div className="relative flex items-center justify-center w-5">
          
          {/* Pulsating background ring for High Severity and Bug Storm critical spikes */}
          {(milestone.type === 'bug_storm' || milestone.severity === 'high') && (
            <div className={`absolute w-7 h-7 rounded-full opacity-35 ${
              milestone.type === 'bug_storm' ? 'bg-rose-500 animate-pulse-ring' : 'bg-emerald-500 animate-ping'
            }`} />
          )}
          
          {/* Center visual dot node */}
          <div className={`w-3.5 h-3.5 rounded-full shrink-0 z-10 transition-transform duration-300 group-hover:scale-125 ${cfg.dot}`} />
        </div>

        {/* Spine line connecting nodes, illuminated on hover */}
        {!isLast && (
          <div className="w-[1px] flex-1 bg-gradient-to-b from-zinc-800 via-zinc-800 to-zinc-900 group-hover:from-emerald-500/40 group-hover:to-zinc-800 mt-1 transition-all duration-500" />
        )}
      </div>

      {/* Narrative Card contents */}
      <div className={`mb-5 flex-1 rounded-xl border p-4 transition-all duration-300 hover:translate-x-1 ${cfg.bg} ${cfg.border} ${cfg.glow} shadow-lg shadow-black/30`}>
        
        {/* Top title and properties row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] select-none">{cfg.icon}</span>
              <span className={`text-[10px] uppercase font-mono tracking-widest ${cfg.text}`}>
                {cfg.label}
              </span>
            </div>
            <h3 className="text-sm font-semibold font-mono text-zinc-100 tracking-tight mt-1 leading-snug group-hover:text-emerald-300 transition-colors">
              {milestone.title}
            </h3>
          </div>
          
          <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
            <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${SEVERITY_BADGE[milestone.severity]}`}>
              {milestone.severity}
            </span>
            <span className="text-zinc-500 mt-1">{milestone.period}</span>
          </div>
        </div>

        {/* Detailed structural analysis narrative */}
        <p className="text-xs text-zinc-400 font-mono leading-relaxed select-text">
          {milestone.description}
        </p>

        {/* Interactive Commit Hash Badge Matrix */}
        {milestone.commit_hashes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-zinc-900/60">
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">Key Commits:</span>
            <div className="flex flex-wrap gap-1.5">
              {milestone.commit_hashes.map((hash) => (
                <code
                  key={hash}
                  className="text-[10px] bg-zinc-950 hover:bg-zinc-900 hover:text-emerald-400 text-zinc-500 border border-zinc-900 hover:border-zinc-800 px-1.5 py-0.5 rounded font-mono transition-all select-all"
                  title="Click to copy SHA hash"
                  onClick={(e) => {
                    navigator.clipboard.writeText(hash);
                    const original = e.currentTarget.innerText;
                    e.currentTarget.innerText = 'COPIED';
                    e.currentTarget.style.color = '#34d399';
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.innerText = original;
                        e.currentTarget.style.color = '';
                      }
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
  if (milestones.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-700 text-xs font-mono select-none">
        Timeline will appear here after analysis.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-900/60 pb-2">
        <h3 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider">Archaeological Timeline</h3>
        <span className="text-[10px] font-mono text-zinc-600 uppercase">({milestones.length} milestones identified)</span>
      </div>
      
      {/* Milestone card scroll lane */}
      <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin select-none">
        {milestones.map((m, i) => (
          <MilestoneCard 
            key={m.id} 
            milestone={m} 
            index={i} 
            isLast={i === milestones.length - 1} 
          />
        ))}
      </div>
    </div>
  );
}

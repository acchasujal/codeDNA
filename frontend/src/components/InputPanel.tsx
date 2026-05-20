/**
 * InputPanel.tsx — Git log paste box, drag-and-drop file upload, and demo presets.
 * Monospace dev console aesthetic.
 * Strict: No <form> tags are used. All triggers are handled by standard event handlers.
 */

import React, { useRef } from 'react';

interface InputPanelProps {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}

export default function InputPanel({ value, onChange, onAnalyze, isLoading }: InputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // High-fidelity React repository demo logs to enable instant demo evaluation
  const handleLoadDemo = () => {
    const demoLogs = `commit f543c1ba027a4d6f8a9ee120
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Wed Mar 11 16:32:00 2026 -0400

    fix: Resolve memory leak in concurrent scheduler effect hydration
    
    Ensure fiber cleanup callbacks decouple reference roots on teardown.
    This resolves a high-severity memory leak during dynamic mounting loops.

 packages/react-reconciler/src/ReactFiberCommitWork.js | 18 +++++++-------
 1 file changed, 9 insertions(+), 9 deletions(-)

commit e3a298bc19d841c9f0ef98a3
Author: Sebastian Markbåge <sebastian@meta.com>
Date:   Mon Mar 09 10:14:22 2026 -0400

    pivot: Transition reconciler interface to React 19 fiber graph
    
    Migrate the global work loop executor to process high-priority lane groups.
    Removes the legacy synchronous rendering pathways entirely.

 packages/react-reconciler/src/ReactFiberWorkLoop.js | 280 ++++++++++++++---------
 2 files changed, 175 insertions(+), 105 deletions(-)

commit d481c9abef8a100ceefd3324
Author: Andrew Clark <andrew@meta.com>
Date:   Fri Mar 06 18:44:11 2026 -0400

    refactor: Extract context hook binding logic into shared dispatcher
    
    Clean up dependency layers inside hooks reconciler. Decouple internal
    dynamic state contexts to reduce bundle footprints and enhance readability.

 packages/react-reconciler/src/ReactFiberHooks.js | 94 ++++++++++---------
 1 file changed, 49 insertions(+), 45 deletions(-)

commit c192837bcde829023efd7761
Author: Sophie Alpert <sophie@meta.com>
Date:   Tue Mar 03 14:02:55 2026 -0400

    fix: Handle null ref exceptions inside useImperativeHandle callback
    
    Guards imperative handle initialization against micro-frame timing slips.
    Adds regression test suite and strict type signatures.

 packages/react/src/ReactImperativeHandle.js | 24 ++++++++----
 1 file changed, 16 insertions(+), 8 deletions(-)

commit b293847293bfe92a9efd0193
Author: Dan Abramov <dan.abramov@gmail.com>
Date:   Fri Feb 27 11:21:40 2026 -0500

    stability: Expand regression verification for Server Component streams
    
    Covers error boundary bubbles, nested suspense boundaries, and
    asynchronous chunk hydration under lossy network parameters.

 packages/react-server/src/ReactFlightServer.js | 54 ++++++++++++++------
 1 file changed, 38 insertions(+), 16 deletions(-)
`;
    onChange(demoLogs);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      onChange(text ?? '');
    };
    reader.readAsText(file);
    
    // Reset inputs so the user can import the same file again
    e.target.value = '';
  };

  // Safe line count parser to prevent layout thrashing on heavy logs
  const linesCount = value ? value.split('\n').filter(l => l.trim().length > 0).length : 0;
  const isInputValid = value.trim().length >= 10;

  return (
    <div className="flex flex-col gap-4 h-full select-none">
      
      {/* Header bar with visual accent indicators */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">
              Git History Log
            </h2>
          </div>
          <p className="text-[10px] font-mono text-zinc-600 mt-1">
            Accepts: <code className="text-emerald-500 font-mono font-semibold">git log --stat</code> formats
          </p>
        </div>

        <div className="flex gap-2">
          {/* File uploader trigger */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFileUpload}
            id="git-log-file-input"
          />
          <button
            id="btn-upload-file"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] font-mono text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
            title="Import text log file"
          >
            Upload .txt
          </button>
        </div>
      </div>

      {/* Code / Text input block with glowing focused ring and absolute scanlines */}
      <div className="flex-1 min-h-0 relative group">
        <textarea
          id="git-log-input"
          className="w-full h-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-4
                     text-xs font-mono text-zinc-300 placeholder-zinc-700
                     focus:outline-none focus:border-emerald-800/80 focus:ring-1 focus:ring-emerald-800/50
                     resize-none transition-all duration-300 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]
                     group-hover:border-zinc-800 scrollbar-thin"
          placeholder={`# Format expected:
commit a3e8d24...
Author: Dan Abramov <dan@gmail.com>
Date:   Wed Mar 11 16:32:00 2026 -0400

    fix: Resolve memory leak in hooks callback...
    
 packages/react/src/ReactHooks.js | 12 +++---`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="Git log content input"
        />

        {value.length === 0 && (
          <div 
            onClick={handleLoadDemo}
            className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center cursor-pointer bg-zinc-950/50 hover:bg-zinc-950/70 transition-all rounded-xl border border-dashed border-zinc-900 hover:border-zinc-800"
          >
            <span className="text-[11px] font-mono text-zinc-600 mb-2">// Text box is empty</span>
            <span className="text-xs font-mono text-emerald-500/80 hover:text-emerald-400 border border-emerald-950 bg-emerald-950/20 px-3 py-2 rounded-lg transition-colors shadow-sm select-none">
              ⚡ Load React Demo Commit Log
            </span>
          </div>
        )}
      </div>

      {/* Input Analytics Summary & Execution panel */}
      <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3">
        <div className="flex flex-col font-mono text-[10px] text-zinc-600">
          <span>{linesCount.toLocaleString()} structural lines</span>
          {value.trim().length > 0 && (
            <span className="text-zinc-500 mt-0.5">
              Size: {(value.length / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {value.trim().length > 0 && (
            <button
              onClick={() => onChange('')}
              className="px-3 py-2 border border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-zinc-300 font-mono text-xs rounded-lg cursor-pointer transition-colors active:scale-95"
            >
              Clear
            </button>
          )}

          <button
            id="btn-analyze"
            onClick={onAnalyze}
            disabled={isLoading || !isInputValid}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 
                       disabled:from-zinc-900 disabled:to-zinc-900 disabled:text-zinc-600 text-zinc-950 disabled:shadow-none
                       text-xs font-mono font-bold rounded-lg cursor-pointer
                       transition-all duration-200 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.15)]
                       focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {isLoading ? 'Processing...' : 'Analyze DNA →'}
          </button>
        </div>
      </div>
    </div>
  );
}

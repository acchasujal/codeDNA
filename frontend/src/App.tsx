/**
 * App.tsx — CodeDNA Root Layout & State Orchestrator.
 *
 * v2 changes:
 *   - Removed loadingSteps setInterval animation (complexity with no trust value).
 *   - Removed CSS grid background + CRT scanline overlays (distracting on GIFs).
 *   - Fixed 3-column layout for 1280px+ screens, graceful at 1100px.
 *   - Removed animate-ping from liveness dot (too distracting for a status indicator).
 *   - Removed "SECURE SANDBOX" footer text (meaningless jargon).
 *   - Health score is now the first element in panel 2 (prime real estate).
 *   - Passes breakdown prop to HealthScore.
 *   - Footer now shows processing_time_ms if available.
 *   - Loading state: simple spinner + one-line message + CSS progress bar.
 */

import { useState, useEffect, useRef } from 'react';
import { checkHealth, analyzeGitLog } from './api/analyze';
import type { AnalysisStatus, AnalysisResult } from './api/analyze';

import InputPanel     from './components/InputPanel';
import Timeline       from './components/Timeline';
import HealthScore    from './components/HealthScore';
import ReasoningPanel from './components/ReasoningPanel';
import ExportButton   from './components/ExportButton';

type AppState = 'idle' | 'loading' | 'done' | 'error';

function extractJsonFromText(raw: string): any {
  const text = raw.trim();
  
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Ignore and proceed to extraction
  }

  // Find all start and end curly braces to try every candidate JSON substring
  const startIndices: number[] = [];
  const endIndices: number[] = [];
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') startIndices.push(i);
    if (text[i] === '}') endIndices.push(i);
  }

  // Search from the end backwards (since the valid JSON block is typically at the end of the stream)
  for (let i = startIndices.length - 1; i >= 0; i--) {
    const start = startIndices[i];
    for (let j = endIndices.length - 1; j >= 0; j--) {
      const end = endIndices[j] + 1;
      if (end <= start) continue;
      
      try {
        const candidate = text.slice(start, end);
        const parsed = JSON.parse(candidate);
        // Ensure it is our structured analysis report
        if (parsed && typeof parsed === 'object' && parsed.metadata && parsed.milestones && parsed.metrics) {
          return parsed;
        }
      } catch {
        // Continue searching
      }
    }
  }
  
  throw new Error('Could not parse a valid JSON analysis report from the stream.');
}

export default function App() {
  const [gitLog,          setGitLog]          = useState('');
  const [appState,        setAppState]        = useState<AppState>('idle');
  const [result,          setResult]          = useState<AnalysisResult | null>(null);
  const [errorMsg,        setErrorMsg]        = useState('');
  const [analysisStatus,  setAnalysisStatus]  = useState<AnalysisStatus | null>(null);
  const [processingMs,    setProcessingMs]    = useState<number | null>(null);
  // degraded_mode: true when the fallback model was used (primary was overloaded)
  const [degradedMode,    setDegradedMode]    = useState<{ model: string; message: string } | null>(null);

  // SSE stream control
  const [streamKey,    setStreamKey]    = useState(0);
  const [streamActive, setStreamActive] = useState(false);
  const [streamGitLog, setStreamGitLog] = useState('');

  // Backend liveness
  const [apiLiveness,  setApiLiveness]  = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeModel,  setActiveModel]  = useState('');

  const analysisStartTimeRef = useRef<number | null>(null);

  // Ping backend on mount
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const resp = await checkHealth();
        if (alive) {
          setApiLiveness(resp.status === 'ok' ? 'online' : 'offline');
          setActiveModel(resp.model);
        }
      } catch {
        if (alive) setApiLiveness('offline');
      }
    };
    void check();
    return () => { alive = false; };
  }, []);

  const handleAnalyze = async () => {
    const trimmed = gitLog.trim();
    if (trimmed.length < 10) return;

    setAppState('loading');
    setResult(null);
    setErrorMsg('');
    setProcessingMs(null);
    setDegradedMode(null);
    analysisStartTimeRef.current = performance.now();

    // Start reasoning stream
    setStreamKey((k) => k + 1);
    setStreamGitLog(trimmed);
    setStreamActive(true);
  };

  const handleStreamComplete = async (finalText: string, streamError: string | null) => {
    setStreamActive(false);

    try {
      if (streamError) {
        throw new Error(streamError);
      }

      const parsed = extractJsonFromText(finalText);
      
      // Let's validate the parsed result structure
      if (!parsed.metadata || !parsed.milestones || !parsed.metrics) {
        throw new Error("Analysis failed to produce a valid report. The stream ended abruptly or failed to parse.");
      }

      setResult(parsed);
      setAnalysisStatus(parsed.status ?? 'success');
      
      if (analysisStartTimeRef.current !== null) {
        const totalMs = Math.round(performance.now() - analysisStartTimeRef.current);
        setProcessingMs(totalMs);
      }
      
      setAppState('done');
    } catch (err) {
      console.warn("Reasoning stream parse failed or encountered an error. Attempting robust non-streaming analysis fallback...", err);
      
      // Attempt robust non-stream fallback using the backend fallback engine
      try {
        setAppState('loading');
        // Call backend /analyze directly
        const resp = await analyzeGitLog(gitLog);
        
        if (resp.success && resp.result) {
          setResult(resp.result);
          setAnalysisStatus(resp.status);
          if (resp.processing_time_ms) {
            setProcessingMs(resp.processing_time_ms);
          } else if (analysisStartTimeRef.current !== null) {
            setProcessingMs(Math.round(performance.now() - analysisStartTimeRef.current));
          }
          if (resp.degraded_mode) {
            setDegradedMode({
              model: resp.model_used ?? 'fallback',
              message: resp.degraded_message ?? 'Using fallback model.'
            });
          }
          setAppState('done');
        } else {
          throw new Error(resp.error ?? 'Unknown error from fallback analyzer.');
        }
      } catch (fallbackErr) {
        setErrorMsg(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to analyze git log.');
        setAppState('error');
      }
    }
  };

  const isLoading = appState === 'loading';

  return (
    <div
      className="relative min-h-screen bg-zinc-950 flex flex-col font-sans overflow-hidden
                 text-zinc-100 selection:bg-emerald-500/20 selection:text-emerald-300"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 border-b border-zinc-900/80 bg-zinc-950/80 backdrop-blur-md
                   px-6 py-3 flex items-center justify-between z-10"
      >
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600
                       flex items-center justify-center text-zinc-950 font-black
                       shadow-[0_0_12px_rgba(16,185,129,0.25)]"
          >
            <span className="text-sm font-mono select-none">⌬</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-mono font-bold tracking-tight text-zinc-100">
                CodeDNA
              </span>
              <span
                className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded
                           border border-zinc-800 bg-zinc-900/50 text-zinc-500 tracking-wider"
              >
                v2.0
              </span>
            </div>
            <p className="text-[10px] font-mono text-zinc-600 tracking-wide mt-0.5">
              AI Codebase Archaeologist · Gemma 4
            </p>
          </div>
        </div>

        {/* Right side: status + actions */}
        <div className="flex items-center gap-5">
          {/* Liveness indicator */}
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="text-zinc-600">Engine:</span>
            {apiLiveness === 'checking' && (
              <span className="text-zinc-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
                checking
              </span>
            )}
            {apiLiveness === 'online' && (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse
                                 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                online
              </span>
            )}
            {apiLiveness === 'offline' && (
              <span className="text-rose-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                offline — start backend
              </span>
            )}
          </div>

          {/* Model name */}
          {activeModel && (
            <span className="text-[10px] text-zinc-700 font-mono hidden lg:inline">
              {activeModel}
            </span>
          )}

          {/* Export button — only when result is available */}
          {result && <ExportButton result={result} />}
        </div>
      </header>

      {/* ── Alert banners ────────────────────────────────────────────────── */}
      {appState === 'error' && (
        <div
          className="shrink-0 mx-5 mt-4 bg-rose-950/30 border border-rose-900/40
                     text-rose-300 text-xs px-4 py-3 rounded-lg flex items-center gap-3
                     animate-fade-in font-mono z-10"
        >
          <span className="text-rose-400 font-bold text-base shrink-0">⚠</span>
          <div>
            <span className="text-rose-200 font-semibold">Analysis failed: </span>
            {errorMsg}
          </div>
        </div>
      )}

      {appState === 'done' && analysisStatus === 'partial' && (
        <div
          className="shrink-0 mx-5 mt-4 bg-amber-950/20 border border-amber-900/30
                     text-amber-300 text-xs px-4 py-3 rounded-lg flex items-center gap-3
                     animate-fade-in font-mono z-10"
        >
          <span className="text-amber-400 font-bold shrink-0">⚡</span>
          <span>
            <span className="text-amber-200 font-semibold">Partial analysis: </span>
            Commit messages are sparse — some fields have reduced confidence.
          </span>
        </div>
      )}

      {/* Degraded-mode banner — shown when fallback model was used */}
      {appState === 'done' && degradedMode && (
        <div
          className="shrink-0 mx-5 mt-2 bg-sky-950/20 border border-sky-900/30
                     text-sky-300 text-xs px-4 py-3 rounded-lg flex items-center gap-3
                     animate-fade-in font-mono z-10"
        >
          <span className="text-sky-400 font-bold shrink-0">ⓘ</span>
          <span>
            <span className="text-sky-200 font-semibold">Resilient fallback: </span>
            {degradedMode.message}{' '}
            <span className="text-sky-500">[{degradedMode.model}]</span>
          </span>
        </div>
      )}

      {/* ── 3-Panel Layout ───────────────────────────────────────────────── */}
      {/* Min-width 1280px. At narrower widths panels compress gracefully. */}
      <main className="flex-1 grid grid-cols-[340px_1fr_360px] gap-0 overflow-hidden min-h-0 relative z-10">

        {/* Panel 1: Input */}
        <section className="flex flex-col border-r border-zinc-900 bg-zinc-950/40 p-5 overflow-hidden">
          <InputPanel
            value={gitLog}
            onChange={setGitLog}
            onAnalyze={() => void handleAnalyze()}
            isLoading={isLoading}
          />
        </section>

        {/* Panel 2: Health + Timeline */}
        <section className="flex flex-col overflow-hidden p-5 gap-4">

          {/* ── Health Score (always at top, highest priority) ── */}
          {result && (
            <div
              className="shrink-0 border border-zinc-900 rounded-xl p-4
                         bg-zinc-950/60 backdrop-blur-sm shadow-[0_2px_20px_rgba(0,0,0,0.3)]
                         animate-slide-up"
            >
              <HealthScore
                score={result.metadata.health_score}
                justification={result.metadata.health_justification}
                timeSpan={result.metadata.time_span_readable}
                commitsAnalyzed={result.metadata.commits_analyzed}
                dataQuality={result.data_quality}
                breakdown={result.metadata.health_breakdown}
              />
            </div>
          )}

          {/* ── Loading state ── */}
          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 animate-fade-in">
              <div className="w-12 h-12 rounded-full border-t-2 border-emerald-500 border-r-2 border-transparent animate-spin" />
              <div className="text-center font-mono">
                <p className="text-xs text-zinc-400 mb-3">
                  Gemma 4 is analyzing your codebase...
                </p>
                {/* CSS progress bar — no JS interval needed */}
                <div className="w-48 h-0.5 bg-zinc-900 rounded-full mx-auto overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500
                               rounded-full animate-loading-bar"
                />
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  Reasoning stream active in right panel
                </p>
              </div>
            </div>
          )}

          {/* ── Idle state ── */}
          {appState === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none animate-fade-in">
              <div
                className="w-14 h-14 rounded-2xl border border-zinc-900 bg-zinc-900/20
                           flex items-center justify-center text-zinc-700 text-2xl mb-4 font-mono"
              >
                ⌬
              </div>
              <h3 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">
                Ready to Analyze
              </h3>
              <p className="text-xs text-zinc-600 max-w-xs mt-2 leading-relaxed font-mono">
                Paste a git log on the left, then click Analyze DNA.
                Gemma 4 will map the codebase's full history.
              </p>
            </div>
          )}

          {/* ── Codebase narrative summary ── */}
          {result && (
            <div
              className="shrink-0 font-mono text-xs text-zinc-400 leading-relaxed
                         px-3 py-2.5 bg-zinc-900/20 border-l-2 border-emerald-500/60
                         rounded-r-lg animate-slide-up select-text"
            >
              <span className="text-emerald-400/80 font-bold uppercase tracking-wider text-[9px] block mb-1">
                Codebase Narrative
              </span>
              {result.summary}
            </div>
          )}

          {/* ── Timeline ── */}
          {result && (
            <div className="flex-1 overflow-hidden min-h-0">
              <Timeline milestones={result.milestones} />
            </div>
          )}
        </section>

        {/* Panel 3: Reasoning stream */}
        <section className="flex flex-col border-l border-zinc-900 bg-zinc-950/40 p-5 overflow-hidden">
          <ReasoningPanel
            key={streamKey}
            gitLog={streamGitLog}
            isActive={streamActive}
            onStreamComplete={handleStreamComplete}
          />
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 border-t border-zinc-900/80 bg-zinc-950/80 backdrop-blur-md
                   px-6 py-2.5 flex items-center justify-between text-[10px] font-mono
                   text-zinc-600 z-10"
      >
        <span>
          Google Gemma 4 Challenge &bull;{' '}
          <span className="text-zinc-700">Dev.to Hackathon</span>
        </span>

        {result && (
          <div className="flex items-center gap-4 animate-fade-in text-zinc-600">
            <span>
              Peak Volatility:{' '}
              <span className="text-zinc-400">{result.metrics.most_chaotic_period}</span>
            </span>
            <span className="text-zinc-800">|</span>
            <span>
              Fix Rate:{' '}
              <span className="text-zinc-400">{result.metrics.bug_fix_ratio}</span>
            </span>
            {result.metrics.peak_month_commits != null && (
              <>
                <span className="text-zinc-800">|</span>
                <span>
                  Peak Month:{' '}
                  <span className="text-zinc-400">{result.metrics.peak_month_commits} commits</span>
                </span>
              </>
            )}
            {processingMs != null && (
              <>
                <span className="text-zinc-800">|</span>
                <span>
                  Analyzed in{' '}
                  <span className="text-zinc-400">{(processingMs / 1000).toFixed(1)}s</span>
                </span>
              </>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

/**
 * App.tsx — CodeDNA Root Layout & State Orchestrator.
 * Designed with a cinematic, highly-polished dark terminal aesthetic.
 * Manages active analysis state, health check pings, and layout rendering.
 */

import { useState, useEffect } from 'react';
import { analyzeGitLog, checkHealth } from './api/analyze';
import type { AnalysisStatus } from './api/analyze';
import type { AnalysisResult } from './api/analyze';

import InputPanel from './components/InputPanel';
import Timeline from './components/Timeline';
import HealthScore from './components/HealthScore';
import ReasoningPanel from './components/ReasoningPanel';
import ExportButton from './components/ExportButton';

type AppState = 'idle' | 'loading' | 'done' | 'error';

export default function App() {
  const [gitLog, setGitLog] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);

  // SSE streaming tracking
  const [streamKey, setStreamKey] = useState(0);
  const [streamActive, setStreamActive] = useState(false);
  const [streamGitLog, setStreamGitLog] = useState('');

  // API Backend Liveness State
  const [apiLiveness, setApiLiveness] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeModel, setActiveModel] = useState<string>('');

  // Cinematic loader step tracker
  const [loaderStep, setLoaderStep] = useState(0);
  const loadingSteps = [
    'Initializing ingestion pipeline...',
    'Compressing noise & repetitive merge commits...',
    'Evaluating commit history quality...',
    'Transmitting git context payload to Gemma 4...',
    'Awaiting Gemma 4 logical stream...',
    'Synthesizing final architectural timeline...'
  ];

  // Ping backend liveness on mount
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const resp = await checkHealth();
        if (active) {
          setApiLiveness(resp.status === 'ok' ? 'online' : 'offline');
          setActiveModel(resp.model);
        }
      } catch (err) {
        if (active) {
          setApiLiveness('offline');
        }
      }
    };
    checkStatus();
    return () => {
      active = false;
    };
  }, []);

  // Stagger loaders when in loading state
  useEffect(() => {
    if (appState !== 'loading') {
      setLoaderStep(0);
      return;
    }

    const interval = setInterval(() => {
      setLoaderStep((prev) => {
        if (prev < loadingSteps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [appState]);

  const handleAnalyze = async () => {
    const trimmed = gitLog.trim();
    if (trimmed.length < 10) return;

    setAppState('loading');
    setResult(null);
    setErrorMsg('');
    setLoaderStep(0);

    // parallel stream start
    setStreamKey((k) => k + 1);
    setStreamGitLog(trimmed);
    setStreamActive(true);

    try {
      const response = await analyzeGitLog(trimmed);
      if (!response.success || !response.result) {
        throw new Error(response.error ?? 'Analysis failed to return result.');
      }
      setResult(response.result);
      setAnalysisStatus(response.status);
      setAppState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setAppState('error');
      setStreamActive(false);
    }
  };

  const handleStreamComplete = () => {
    setStreamActive(false);
  };

  const isLoading = appState === 'loading';

  return (
    <div className="relative min-h-screen bg-zinc-950 flex flex-col font-sans overflow-hidden text-zinc-100 selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* Cinematic grid background effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#09090b_1px,transparent_1px),linear-gradient(to_bottom,#09090b_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none opacity-40" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-zinc-950/80 to-zinc-950 pointer-events-none" />

      {/* Futuristic CRT scanlines effect (extremely low opacity for subtlety) */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none z-50 opacity-10" />

      {/* ── Top cinematic Header ────────────────────────────────────────── */}
      <header className="relative shrink-0 border-b border-zinc-900/80 bg-zinc-950/70 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-zinc-950 font-black shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <span className="text-lg select-none font-mono">⌬</span>
            <div className="absolute inset-0 rounded-lg border border-emerald-400/40 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-bold tracking-tight text-zinc-100">CodeDNA</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 text-zinc-500 tracking-wider">v1.0.0</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-500 tracking-wide mt-0.5">AI-Powered Codebase Archaeologist & History Synthesizer</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Real liveness status badge */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-zinc-600">Engine:</span>
            {apiLiveness === 'checking' && (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
                verifying connection...
              </span>
            )}
            {apiLiveness === 'online' && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-ping" />
                online
              </span>
            )}
            {apiLiveness === 'offline' && (
              <span className="flex items-center gap-1.5 text-rose-500">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)] animate-pulse" />
                offline
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {result && <ExportButton result={result} />}
            <span className="text-xs text-zinc-700 font-mono hidden md:inline">
              {activeModel ? activeModel : 'gemma-2.0-flash-thinking-exp'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Warnings / Alerts banner ────────────────────────────────────── */}
      {appState === 'error' && (
        <div className="shrink-0 mx-6 mt-4 bg-rose-950/30 border border-rose-900/40 text-rose-300 text-xs px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in font-mono shadow-[0_4px_20px_rgba(244,63,94,0.05)] z-10">
          <span className="text-rose-500 font-bold select-none text-base">⚠</span>
          <div>
            <strong className="text-rose-200">Archaeological Analysis Interrupted:</strong> {errorMsg}
          </div>
        </div>
      )}

      {appState === 'done' && analysisStatus === 'partial' && (
        <div className="shrink-0 mx-6 mt-4 bg-amber-950/20 border border-amber-900/30 text-amber-300 text-xs px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in font-mono shadow-[0_4px_20px_rgba(245,158,11,0.05)] z-10">
          <span className="text-amber-500 font-bold select-none text-base">⚡</span>
          <div>
            <strong className="text-amber-200">Incomplete Archaeological Signatures:</strong> Commit messages are sparse or repetitive. Churn ratios and milestone correlations may possess reduced confidence.
          </div>
        </div>
      )}

      {/* ── Main 3-Panel Space ─────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-[380px_1fr_400px] gap-0 overflow-hidden min-h-0 relative z-10">
        
        {/* Panel 1: Input controls & Commit pasting */}
        <section className="flex flex-col border-r border-zinc-900 bg-zinc-950/40 backdrop-blur-sm p-5 overflow-hidden">
          <InputPanel
            value={gitLog}
            onChange={setGitLog}
            onAnalyze={handleAnalyze}
            isLoading={isLoading}
          />
        </section>

        {/* Panel 2: Output Timeline and Churn Analysis */}
        <section className="flex flex-col overflow-hidden bg-zinc-950/10 p-6 gap-6 relative">
          
          {/* Loaded Analysis Stats & Score header */}
          {result && (
            <div className="shrink-0 border border-zinc-900 rounded-xl p-5 bg-zinc-950/60 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] animate-slide-up relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full pointer-events-none" />
              <HealthScore
                score={result.metadata.health_score}
                justification={result.metadata.health_justification}
                timeSpan={result.metadata.time_span_readable}
                commitsAnalyzed={result.metadata.commits_analyzed}
                dataQuality={result.data_quality}
              />
            </div>
          )}

          {/* Epic interactive pipeline loader */}
          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-t-2 border-emerald-500 border-r-2 border-transparent animate-spin" />
                </div>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-emerald-400 animate-pulse">⌬</span>
              </div>
              <div className="font-mono text-xs text-zinc-400 space-y-2 max-w-sm">
                <p className="text-zinc-100 font-semibold tracking-wider uppercase text-[11px] mb-1">Gemma 4 Archeological Synthesizer</p>
                <div className="h-6 overflow-hidden flex items-center justify-center">
                  <span className="text-emerald-500 font-bold animate-pulse">{loadingSteps[loaderStep]}</span>
                </div>
                <div className="w-48 h-1 bg-zinc-900 rounded-full mx-auto overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-[2800ms] cubic-bezier(0.4, 0, 0.2, 1)"
                    style={{ width: `${((loaderStep + 1) / loadingSteps.length) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">Streaming structured token stream on the side panel</p>
              </div>
            </div>
          )}

          {/* Initial/Idle state */}
          {appState === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-fade-in select-none">
              <div className="w-16 h-16 rounded-2xl border border-zinc-900 bg-zinc-900/10 flex items-center justify-center text-zinc-700 text-3xl mb-4 font-mono shadow-[inset_0_1px_5px_rgba(255,255,255,0.02)]">
                ⌬
              </div>
              <h3 className="text-sm font-semibold font-mono text-zinc-400 uppercase tracking-widest">Chronicle Core</h3>
              <p className="text-xs text-zinc-600 max-w-xs mt-1.5 leading-relaxed font-mono">
                Paste raw git history and unleash Gemma 4 reasoning to map tech-debt spikes, pivot points, and codebase metrics.
              </p>
            </div>
          )}

          {/* Narrative Summary */}
          {result && (
            <div className="shrink-0 font-mono text-xs text-zinc-400 leading-relaxed px-4 py-3 bg-zinc-900/20 border-l-2 border-emerald-500/80 pl-4 rounded-r-lg animate-slide-up shadow-[0_2px_15px_rgba(0,0,0,0.15)]">
              <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px] block mb-1">Codebase Narrative</span>
              {result.summary}
            </div>
          )}

          {/* Timeline scroll container */}
          {result && (
            <div className="flex-1 overflow-hidden">
              <Timeline milestones={result.milestones} />
            </div>
          )}
        </section>

        {/* Panel 3: Terminal streaming thinking mode output */}
        <section className="flex flex-col border-l border-zinc-900 bg-zinc-950/40 backdrop-blur-sm p-5 overflow-hidden">
          <ReasoningPanel
            key={streamKey}
            gitLog={streamGitLog}
            isActive={streamActive}
            onStreamComplete={handleStreamComplete}
          />
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="shrink-0 relative border-t border-zinc-900/80 bg-zinc-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 z-10">
        <div>
          Google Gemma 4 Challenge &bull; <span className="text-zinc-600">Dev.to Hackathon Entry</span>
        </div>
        {result && (
          <div className="flex items-center gap-4 animate-fade-in">
            <span>
              Peak Volatility: <span className="text-zinc-300 font-semibold">{result.metrics.most_chaotic_period}</span>
            </span>
            <span className="text-zinc-800">|</span>
            <span>
              Refactor Stability: <span className="text-zinc-300 font-semibold">{result.metrics.most_stable_period}</span>
            </span>
            <span className="text-zinc-800">|</span>
            <span>
              Defect Fix Density: <span className="text-emerald-400 font-semibold">{result.metrics.bug_fix_ratio}</span>
            </span>
          </div>
        )}
        <div className="hidden sm:block text-zinc-700">
          SECURE SANDBOX
        </div>
      </footer>
    </div>
  );
}

/**
 * ReasoningPanel.tsx — SSE Streaming Dev Console for Gemma 4 Thinking Tokens.
 * Connects directly to GET /analyze/stream, pulling real-time logical reasoning traces.
 * Employs custom buffers to isolate render cascades, preventing layout thrashing under heavy streams.
 */

import { useEffect, useRef, useState } from 'react';
import { openThinkingStream } from '../api/analyze';

interface ReasoningPanelProps {
  gitLog: string;         // Re-initiates stream when this changes
  isActive: boolean;      // Orchestrated by App state
  onStreamComplete: () => void;
}

export default function ReasoningPanel({ gitLog, isActive, onStreamComplete }: ReasoningPanelProps) {
  const [tokens, setTokens] = useState<string>('');
  const [isDone, setIsDone] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [duration, setDuration] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive || !gitLog) return;

    // Reset states and clear prior logs
    sourceRef.current?.close();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }
    
    setTokens('');
    setIsDone(false);
    setIsConnecting(true);
    setTokenCount(0);
    setDuration(0);

    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const source = openThinkingStream(gitLog);
    sourceRef.current = source;

    source.onopen = () => {
      setIsConnecting(false);
    };

    source.onmessage = (ev) => {
      const data: string = ev.data;

      // Handle stream completion sentinel
      if (data === '[DONE]') {
        setIsDone(true);
        setIsConnecting(false);
        source.close();
        onStreamComplete();
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
        }
        return;
      }

      // Handle raw error messages forwarded by main.py
      if (data.startsWith('[ERROR]')) {
        setTokens((prev) => prev + `\n\n[FATAL SYSTEM EXCEPTION] ${data}\n`);
        setIsConnecting(false);
        source.close();
        onStreamComplete();
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
        }
        return;
      }

      // De-serialize raw JSON/escaped newlines to render formatting perfectly
      const cleanToken = data.replace(/\\n/g, '\n');
      setTokens((prev) => prev + cleanToken);
      setTokenCount((count) => count + 1);
    };

    source.onerror = () => {
      setTokens((prev) => prev + '\n\n[SYSTEM ALARM] Event stream connection severed. Halting process.\n');
      setIsConnecting(false);
      source.close();
      onStreamComplete();
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };

    return () => {
      source.close();
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [gitLog, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cinematic autoscrolling
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tokens, isConnecting]);

  const isEmpty = tokens.length === 0;

  return (
    <div className="flex flex-col h-full select-none">
      
      {/* Console title block */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isActive && !isDone 
              ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.7)]' 
              : isDone 
                ? 'bg-zinc-600' 
                : 'bg-zinc-700'
          }`} />
          <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">
            Reasoning Stream
          </span>
        </div>

        {/* Dynamic streaming metrics display */}
        {isActive && (
          <div className="font-mono text-[10px] text-zinc-500 flex gap-3">
            <span>tokens: <span className="text-emerald-500/80">{tokenCount}</span></span>
            <span>time: <span className="text-zinc-400">{duration}s</span></span>
          </div>
        )}

        {isDone && (
          <span className="text-[10px] font-mono text-emerald-400 font-semibold uppercase tracking-wider animate-fade-in">
            Stream syncd ✓
          </span>
        )}
      </div>

      {/* Retro developer CRT console body */}
      <div
        className="flex-1 overflow-y-auto bg-black border border-zinc-900 rounded-xl p-4
                   font-mono text-[11px] leading-relaxed select-text scrollbar-thin relative"
        aria-live="polite"
        aria-label="Thinking pipeline traces"
      >
        {/* Subtle CRT raster scans mask for pure hackathon flavor */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black pointer-events-none opacity-40 z-20" />

        {isEmpty && !isActive && (
          <div className="text-zinc-700 space-y-2 select-none z-10 relative">
            <p className="text-zinc-800">// GEMMA 4 THINKING PROCESS LOGS</p>
            <p className="text-zinc-800">// SYSTEM ARTIFACT ID: CONSOLE_CORE_STREAM</p>
            <p className="text-zinc-800">// Awaiting git log sequence ingestion...</p>
            <p className="text-zinc-800 animate-blink-cursor">▌</p>
          </div>
        )}

        {isConnecting && (
          <div className="text-emerald-500/60 animate-pulse font-bold tracking-wide select-none z-10 relative">
            [SYS_LOG] Connecting socket stream to Google AI Studio...
          </div>
        )}

        {/* Real-time tokens block */}
        <div className="text-emerald-400/90 whitespace-pre-wrap font-mono break-all z-10 relative">
          {tokens}
          {isActive && !isDone && tokens.length > 0 && (
            <span className="text-emerald-400 font-bold select-none animate-blink-cursor">▌</span>
          )}
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

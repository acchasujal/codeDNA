/**
 * ReasoningPanel.tsx — SSE Streaming console for Gemma 4 Thinking tokens.
 *
 * v2 changes:
 *   - Uses fetch + ReadableStream POST via openThinkingStream() AbortController API
 *     (replaces EventSource which only supports GET).
 *   - Removed fake terminal theater strings ([SYS_LOG], [FATAL SYSTEM EXCEPTION]).
 *   - Removed the duration timer (adds complexity, low trust value).
 *   - Clean, professional error display.
 *   - controllerRef for clean stream cancellation on unmount/re-trigger.
 */

import { useEffect, useRef, useState } from 'react';
import { openThinkingStream } from '../api/analyze';

const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ChevronUp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);
interface ReasoningPanelProps {
  gitLog:           string;
  isActive:         boolean;
  onStreamComplete: (finalText: string, errorMsg: string | null) => void;
  onCached?:        () => void;
}

export default function ReasoningPanel({
  gitLog,
  isActive,
  onStreamComplete,
  onCached,
}: ReasoningPanelProps) {
  const [tokens, setTokens]           = useState<string>('');
  const [isDone, setIsDone]           = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [tokenCount, setTokenCount]   = useState(0);
  const [isExpanded, setIsExpanded]   = useState(false);

  const bottomRef     = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const accumulatedTokensRef = useRef<string>('');
  const streamErrorRef = useRef<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isActive || !gitLog) return;

    // Cancel any in-flight stream before starting a new one
    controllerRef.current?.abort();

    setTokens('');
    setIsDone(false);
    setIsConnecting(true);
    setTokenCount(0);
    accumulatedTokensRef.current = '';
    streamErrorRef.current = null;
    completedRef.current = false;

    const controller = openThinkingStream(
      gitLog,
      // onToken
      (text) => {
        setIsConnecting(false);
        accumulatedTokensRef.current += text;
        setTokens(accumulatedTokensRef.current);
        setTokenCount((c) => c + 1);
      },
      // onDone
      () => {
        if (completedRef.current) return;
        completedRef.current = true;
        setIsDone(true);
        setIsConnecting(false);
        onStreamComplete(accumulatedTokensRef.current, streamErrorRef.current);
      },
      // onError
      (msg) => {
        streamErrorRef.current = msg;
        accumulatedTokensRef.current += `\n\n[Stream error] ${msg}\n`;
        setTokens(accumulatedTokensRef.current);
        setIsConnecting(false);
      },
      // onCached
      () => {
        if (onCached) onCached();
      }
    );

    controllerRef.current = controller;

    return () => {
      controller.abort();
    };
  }, [gitLog, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom as tokens arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tokens]);

  const isEmpty = tokens.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              isActive && !isDone
                ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                : isDone
                  ? 'bg-zinc-500'
                  : 'bg-zinc-700'
            }`}
          />
          <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">
            Reasoning Stream
          </span>
        </div>

        <div className="font-mono text-[10px] text-zinc-500 flex gap-3">
          {isActive && !isDone && (
            <span>
              tokens:{' '}
              <span className="text-emerald-500">{tokenCount}</span>
            </span>
          )}
          {isDone && (
            <span className="text-emerald-400 font-semibold uppercase tracking-wider animate-fade-in">
              Complete ✓
            </span>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950 border border-zinc-900 rounded-xl p-4
                   font-mono text-[11px] leading-relaxed scrollbar-thin transition-all duration-500 ease-in-out ${
                     isExpanded ? 'max-h-[1200px]' : 'max-h-[160px]'
                   }`}
        aria-live="polite"
        aria-label="Gemma 4 reasoning trace"
      >
        {/* Idle placeholder */}
        {isEmpty && !isActive && (
          <div className="text-zinc-700 space-y-1 select-none">
            <p>{'// Gemma 4 thinking trace'}</p>
            <p>{'// Will appear here during analysis'}</p>
            <p className="animate-blink-cursor">▌</p>
          </div>
        )}

        {/* Connecting indicator */}
        {isConnecting && (
          <div className="text-zinc-500 font-mono">
            Connecting to Gemma 4...
            <span className="animate-blink-cursor ml-1">▌</span>
          </div>
        )}

        {/* Live token stream */}
        <div className="text-emerald-400 whitespace-pre-wrap break-words select-text">
          {tokens}
          {isActive && !isDone && tokens.length > 0 && (
            <span className="text-emerald-400 animate-blink-cursor">▌</span>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Expand / Collapse Button */}
      {(tokens.length > 0 || isConnecting) && (
        <div className="mt-3 flex justify-end shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                See Full Reasoning
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

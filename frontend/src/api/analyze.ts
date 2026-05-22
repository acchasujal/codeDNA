/**
 * analyze.ts — Typed API client for CodeDNA backend.
 *
 * v2 changes:
 *   - openThinkingStream now uses fetch + ReadableStream (POST) instead of
 *     EventSource (GET). This fixes URL-length overflow for large repos and
 *     matches the backend's new POST /analyze/stream endpoint.
 *   - Returns AbortController so callers can cleanly cancel the stream.
 *   - Added new v2 types: HealthBreakdownItem, ConfidenceLevel, updated
 *     Milestone, AnalysisMetrics, AnalyzeResponse.
 *
 * All backend communication goes through these functions.
 * Types mirror backend Pydantic models exactly.
 */

// ─── Enums ─────────────────────────────────────────────────────────────────

export type MilestoneType   = 'bug_storm' | 'refactor' | 'pivot' | 'feature_burst' | 'stability';
export type SeverityLevel   = 'high' | 'medium' | 'low';
export type DataQuality     = 'high' | 'medium' | 'low';
export type AnalysisStatus  = 'success' | 'partial' | 'insufficient_data' | 'error';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ─── Sub-models ────────────────────────────────────────────────────────────

export interface HealthBreakdownItem {
  factor: string;   // e.g. "Commit Message Quality"
  delta:  number;   // signed integer, e.g. +15 or -10
  reason: string;   // one evidence-based sentence
}

export interface AnalysisMetadata {
  commits_analyzed:     number;
  time_span_days:       number;
  time_span_readable:   string;
  health_score:         number;
  health_justification: string;
  health_breakdown:     HealthBreakdownItem[];  // v2: transparent score breakdown
}

export interface Milestone {
  id:             string;
  period:         string;
  type:           MilestoneType;
  title:          string;
  description:    string;
  severity:       SeverityLevel;
  commit_hashes:  string[];
  // v2 additions
  commit_count:   number | null;
  dominant_files: string[];
  confidence:     ConfidenceLevel;
}

export interface AnalysisMetrics {
  most_chaotic_period:  string;
  most_stable_period:   string;
  biggest_pivot_commit: string | null;
  bug_fix_ratio:        string;
  // v2 additions
  peak_month_commits:   number | null;
  avg_monthly_commits:  number | null;
}

export interface ReasoningSummary {
  key_observations:      string[];
  confidence_notes:      string | null;
  reasoning_token_count: number | null;
}

// ─── Root result ───────────────────────────────────────────────────────────

export interface AnalysisResult {
  metadata:      AnalysisMetadata;
  summary:       string;
  milestones:    Milestone[];
  metrics:       AnalysisMetrics;
  churn_summary: string;
  data_quality:  DataQuality;
  reasoning:     ReasoningSummary | null;
}

// ─── API response wrappers ─────────────────────────────────────────────────

export interface AnalyzeResponse {
  success:              boolean;
  status:               AnalysisStatus;
  result?:              AnalysisResult;
  error?:               string;
  commits_preprocessed: number;
  processing_time_ms?:  number;       // v2: wall-clock ms shown in footer
  // v3: multi-model fallback fields
  model_used?:          string;       // which model actually responded
  fallback_level?:      number;       // 0 = primary, 1+ = degraded
  degraded_mode?:       boolean;      // true when fallback was triggered
  degraded_message?:    string;       // user-facing explanation
}

export interface HealthResponse {
  status:      string;
  model:       string;
  max_commits: number;
}

// ─── API base ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// ─── Request helpers ───────────────────────────────────────────────────────

async function _handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string; detail?: string };
      detail = body.error ?? body.detail ?? detail;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * POST /analyze
 * Sends git log text and waits for the full structured analysis (~10–30s).
 */
export async function analyzeGitLog(gitLog: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ git_log: gitLog }),
  });
  return _handleResponse<AnalyzeResponse>(res);
}

/**
 * POST /analyze/stream
 *
 * v2: Uses fetch + ReadableStream instead of EventSource.
 * This allows POST (required for large git logs that overflow GET URL limits).
 *
 * Returns an AbortController. Call controller.abort() to cancel the stream.
 *
 * Callbacks:
 *   onToken(text)  — called for each token chunk received
 *   onDone()       — called when stream completes (success or error)
 *   onError(msg)   — called on stream-level error (before onDone)
 */
export function openThinkingStream(
  gitLog: string,
  onToken: (text: string) => void,
  onDone:  () => void,
  onError: (msg: string) => void,
): AbortController {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`${API_BASE}/analyze/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ git_log: gitLog }),
        signal:  controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        onError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        onDone();
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          onDone();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();

            if (data === '[DONE]') {
              onDone();
              return;
            }
            if (data.startsWith('[ERROR]')) {
              onError(data.slice(7).trim());
              onDone();
              return;
            }
            if (data) {
              // Unescape newlines (backend escapes \n → \\n to preserve SSE framing)
              onToken(data.replace(/\\n/g, '\n'));
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onError(String(err));
      onDone();
    }
  })();

  return controller;
}

/**
 * GET /health
 * Backend liveness check.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return _handleResponse<HealthResponse>(res);
}

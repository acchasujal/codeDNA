/**
 * analyze.ts — Typed API client for CodeDNA backend.
 *
 * All backend communication goes through these functions.
 * Types mirror backend Pydantic models exactly — if models.py changes,
 * update this file in the same commit.
 */

// ─── Enums (mirroring Python Enum values) ─────────────────────────────────

export type MilestoneType  = 'bug_storm' | 'refactor' | 'pivot' | 'feature_burst' | 'stability';
export type SeverityLevel  = 'high' | 'medium' | 'low';
export type DataQuality    = 'high' | 'medium' | 'low';
export type AnalysisStatus = 'success' | 'partial' | 'insufficient_data' | 'error';

// ─── Sub-models ────────────────────────────────────────────────────────────

export interface AnalysisMetadata {
  commits_analyzed:     number;
  time_span_days:       number;
  time_span_readable:   string;
  health_score:         number;   // 0–100
  health_justification: string;
}

export interface Milestone {
  id:             string;
  period:         string;
  type:           MilestoneType;
  title:          string;
  description:    string;
  severity:       SeverityLevel;
  commit_hashes:  string[];
}

export interface AnalysisMetrics {
  most_chaotic_period:  string;
  most_stable_period:   string;
  biggest_pivot_commit: string | null;
  bug_fix_ratio:        string;
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
}

export interface ErrorResponse {
  success:    false;
  status:     'error';
  error:      string;
  error_code: string | null;
}

export interface HealthResponse {
  status:      string;
  model:       string;
  max_commits: number;
}

// ─── API base ──────────────────────────────────────────────────────────────
// In dev: Vite proxy forwards /analyze → http://localhost:8000
// In prod: set VITE_API_BASE in the environment
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// ─── Request helpers ───────────────────────────────────────────────────────

async function _handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string; detail?: string };
      detail = body.error ?? body.detail ?? detail;
    } catch {
      // ignore JSON parse failure — use status text
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * POST /analyze
 * Sends git log text and waits for the full structured analysis (~10–30s).
 * Throws on network error or non-2xx response.
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
 * GET /analyze/stream
 * Opens an EventSource connected to the SSE endpoint.
 * Caller is responsible for calling .close() when done.
 */
export function openThinkingStream(gitLog: string): EventSource {
  const params = new URLSearchParams({ git_log: gitLog });
  return new EventSource(`${API_BASE}/analyze/stream?${params.toString()}`);
}

/**
 * GET /health
 * Backend liveness check.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return _handleResponse<HealthResponse>(res);
}

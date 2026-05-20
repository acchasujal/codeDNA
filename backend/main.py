"""
main.py — CodeDNA FastAPI application.

Architecture:
  - One httpx.AsyncClient per app lifetime (connection-pooled, timeout-aware).
  - POST /analyze   — single Gemma inference call, returns structured JSON.
  - GET  /health    — liveness + config echo.
  - GET  /analyze/stream — real SSE token stream via the streamGenerateContent
                           endpoint; no fake streaming, no polling loops.

Google AI Studio API:
  Non-streaming: POST .../models/{model}:generateContent?key={key}
  Streaming:     POST .../models/{model}:streamGenerateContent?key={key}&alt=sse

Constraints enforced here:
  - ONE Gemma call per /analyze request (no chains, no multi-agent).
  - All network I/O is async (httpx.AsyncClient, never requests/urllib).
  - Blocking code never runs on the event loop.
  - Hard timeout on every API call (REQUEST_TIMEOUT env var).
  - Input validated by Pydantic before any network I/O starts.
  - All errors map to structured ErrorResponse — no raw tracebacks to clients.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from models import (
    AnalysisResult,
    AnalysisStatus,
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorResponse,
    HealthResponse,
)
from preprocessor import preprocess_full
from prompt import get_system_prompt, get_user_prompt

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("codedna")

# ─── Config ───────────────────────────────────────────────────────────────────

# Support both GEMINI_API_KEY (legacy) and GEMMA_API_KEY (spec)
API_KEY: str = (
    os.getenv("GEMMA_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or ""
)
GEMMA_MODEL: str    = os.getenv("GEMMA_MODEL", "gemma-2.0-flash-thinking-exp")
MAX_COMMITS: int    = int(os.getenv("MAX_COMMITS", "400"))
REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "120"))
PORT: int           = int(os.getenv("PORT", "8000"))

# Google AI Studio REST base
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

if not API_KEY:
    raise RuntimeError(
        "No API key found. Set GEMINI_API_KEY or GEMMA_API_KEY in backend/.env"
    )


# ─── App lifespan — shared httpx client ───────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Create one AsyncClient for the process lifetime.
    Connection pooling means repeated requests reuse TCP connections,
    which matters on weak hardware with limited file descriptors.
    """
    timeout = httpx.Timeout(
        connect=10.0,
        read=REQUEST_TIMEOUT,
        write=30.0,
        pool=5.0,
    )
    limits = httpx.Limits(
        max_connections=10,      # safe ceiling for a laptop dev server
        max_keepalive_connections=5,
        keepalive_expiry=30.0,
    )
    async with httpx.AsyncClient(
        base_url=_API_BASE,
        timeout=timeout,
        limits=limits,
        headers={"Content-Type": "application/json"},
    ) as client:
        app.state.client = client
        log.info("HTTP client ready (model=%s timeout=%.0fs)", GEMMA_MODEL, REQUEST_TIMEOUT)
        yield
    log.info("HTTP client closed")


app = FastAPI(
    title="CodeDNA API",
    description="AI Codebase Archaeologist — powered by Gemma 4",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Global exception handlers ────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    body = ErrorResponse(
        error=str(exc.detail),
        error_code="INVALID_INPUT" if exc.status_code == 400 else "API_FAILURE",
    )
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception on %s", request.url.path)
    body = ErrorResponse(
        error=f"Internal server error: {type(exc).__name__}",
        error_code="API_FAILURE",
    )
    return JSONResponse(status_code=500, content=body.model_dump())


# ─── Gemma API helpers ────────────────────────────────────────────────────────

def _build_request_body(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 8192,
) -> dict[str, Any]:
    """
    Build the Google AI Studio generateContent request body.

    Uses the systemInstruction field where the API supports it, which
    reduces hallucination by keeping rules out of the user turn.
    """
    return {
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            # candidateCount must be 1 — we don't want multiple outputs
            "candidateCount": 1,
        },
        # Safety: relax only the category that git commit messages might trigger.
        # Keep all others at default (BLOCK_MEDIUM_AND_ABOVE).
        "safetySettings": [
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_ONLY_HIGH",
            }
        ],
    }


def _extract_text_from_response(body: dict[str, Any]) -> str:
    """
    Pull the generated text from a non-streaming generateContent response.

    Raises:
        ValueError: If the response structure is unexpected or content is blocked.
    """
    candidates = body.get("candidates")
    if not candidates:
        # Check for prompt feedback (blocked input)
        feedback = body.get("promptFeedback", {})
        reason   = feedback.get("blockReason", "unknown")
        raise ValueError(f"No candidates in response (blockReason={reason})")

    candidate = candidates[0]
    finish    = candidate.get("finishReason", "")

    # SAFETY or RECITATION finish reasons mean the output was blocked
    if finish in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT"):
        raise ValueError(f"Content blocked by safety filters (finishReason={finish})")

    parts = candidate.get("content", {}).get("parts", [])
    if not parts:
        raise ValueError("Candidate has no content parts")

    # Concatenate all text parts except thought parts (thinking models split thought vs answer)
    text = "".join(p.get("text", "") for p in parts if not p.get("thought", False))
    if not text.strip():
        raise ValueError("Model returned empty text")

    return text


def _extract_json_from_text(raw: str) -> dict[str, Any]:
    """
    Extract the JSON object from the model's raw text response.

    Handles:
      - Clean JSON (ideal case)
      - ```json ... ``` fences (common Gemma quirk)
      - Leading/trailing prose around the JSON object
    """
    text = raw.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.splitlines()
        text  = "\n".join(lines[1:-1]).strip()

    # Find the outermost { ... } — handles preamble/postamble prose
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object in model response. Preview: {raw[:200]!r}")

    return json.loads(text[start:end])


def _classify_status(result: AnalysisResult) -> AnalysisStatus:
    """
    Detect PARTIAL status: any key narrative field contains 'insufficient_data'.
    This happens legitimately with very terse commit histories.
    """
    _insuf = re.compile(r"insufficient_data", re.IGNORECASE)

    checks = [
        result.summary,
        result.churn_summary,
        result.metrics.most_chaotic_period,
        result.metrics.most_stable_period,
        *(m.description for m in result.milestones),
    ]
    if any(_insuf.search(v) for v in checks):
        return AnalysisStatus.PARTIAL

    return AnalysisStatus.SUCCESS


# ─── Core analysis pipeline ───────────────────────────────────────────────────

async def _run_analysis(
    client: httpx.AsyncClient,
    git_log_raw: str,
) -> tuple[AnalysisResult, int, AnalysisStatus]:
    """
    End-to-end pipeline for a single analysis:
      preprocess → build prompts → call Gemma → parse → validate → classify.

    Returns:
        (AnalysisResult, commit_count, AnalysisStatus)

    Raises:
        ValueError    — bad/unrecognisable user input          (→ HTTP 400)
        TimeoutError  — Gemma did not respond in time          (→ HTTP 504)
        RuntimeError  — API/parse/validation failure           (→ HTTP 500)
    """
    t0 = time.perf_counter()

    # 1. Preprocess — may raise ValueError on unrecognisable input
    prep      = preprocess_full(git_log_raw, max_commits=MAX_COMMITS)
    log.info(
        "Preprocessed: %d→%d commits | quality=%s | tokens≈%d | tiny=%s",
        prep.total_parsed, prep.commit_count,
        prep.quality.level, prep.estimated_tokens, prep.is_tiny_repo,
    )

    # 2. Build prompts (system is static; user carries the git log)
    sys_prompt  = get_system_prompt()
    user_prompt = get_user_prompt(prep.formatted_log)

    # 3. Call Gemma — one request, no retries (demo reliability > retry complexity)
    url  = f"/models/{GEMMA_MODEL}:generateContent"
    body = _build_request_body(sys_prompt, user_prompt)

    try:
        resp = await client.post(
            url,
            params={"key": API_KEY},
            content=json.dumps(body),
        )
    except httpx.TimeoutException as exc:
        raise TimeoutError(
            f"Gemma did not respond within {REQUEST_TIMEOUT:.0f}s"
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error reaching Google AI Studio: {exc}") from exc

    # 4. HTTP-level error handling
    if resp.status_code != 200:
        try:
            detail = resp.json().get("error", {}).get("message", resp.text[:300])
        except Exception:
            detail = resp.text[:300]
        raise RuntimeError(
            f"Google AI Studio returned HTTP {resp.status_code}: {detail}"
        )

    elapsed_api = time.perf_counter() - t0
    log.info("Gemma responded in %.1fs", elapsed_api)

    # 5. Extract text
    try:
        raw_text = _extract_text_from_response(resp.json())
    except ValueError as exc:
        raise RuntimeError(str(exc)) from exc

    # 6. Parse JSON
    try:
        data = _extract_json_from_text(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Model output is not valid JSON: {exc} | "
            f"preview: {raw_text[:300]!r}"
        ) from exc

    # 7. Validate against schema (Pydantic v2)
    try:
        result = AnalysisResult.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(
            f"Model output failed schema validation:\n{exc}"
        ) from exc

    status = _classify_status(result)
    log.info(
        "Analysis complete: status=%s health=%d milestones=%d (%.1fs total)",
        status, result.metadata.health_score, len(result.milestones),
        time.perf_counter() - t0,
    )
    return result, prep.commit_count, status


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness check",
    tags=["Infrastructure"],
)
async def health() -> HealthResponse:
    """Returns service status, active model, and commit cap."""
    return HealthResponse(
        status="ok",
        model=GEMMA_MODEL,
        max_commits=MAX_COMMITS,
    )


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyse a git log",
    tags=["Analysis"],
    responses={
        400: {"model": ErrorResponse, "description": "Invalid git log"},
        504: {"model": ErrorResponse, "description": "Gemma API timeout"},
        500: {"model": ErrorResponse, "description": "API or parse failure"},
    },
)
async def analyze(body: AnalyzeRequest, request: Request) -> AnalyzeResponse:
    """
    Primary analysis endpoint.

    Accepts preprocessed or raw git log text.
    Makes exactly ONE call to Gemma 4 and returns the validated result.
    Typical latency: 10–30 s on the React public repo (400 commits).

    The frontend should:
      1. Open GET /analyze/stream for live reasoning tokens.
      2. Simultaneously POST /analyze for the structured result.
      3. Display the timeline once /analyze responds.
    """
    client: httpx.AsyncClient = request.app.state.client

    try:
        result, commit_count, status = await _run_analysis(client, body.git_log)
        return AnalyzeResponse(
            success=True,
            status=status,
            result=result,
            commits_preprocessed=commit_count,
        )

    except ValueError as exc:
        # Bad user input — tell the client exactly what went wrong
        log.warning("Invalid input: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    except TimeoutError as exc:
        log.error("Gemma timeout: %s", exc)
        raise HTTPException(
            status_code=504,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        log.error("Analysis runtime error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/analyze/stream",
    summary="Stream Gemma 4 tokens via SSE",
    tags=["Analysis"],
)
async def analyze_stream(
    git_log: str = Query(..., description="URL-encoded raw git log text"),
    request: Request = None,  # type: ignore[assignment]
) -> StreamingResponse:
    """
    Server-Sent Events endpoint.

    Streams real token chunks from the Gemma streamGenerateContent endpoint.
    The frontend ReasoningPanel connects here immediately when the user clicks
    Analyze. Token text appears as Gemma produces it.

    SSE event format:
        data: <token text, newlines escaped as \\n>\\n\\n
        data: [DONE]\\n\\n      — stream complete
        data: [ERROR] <msg>\\n\\n — stream-level failure

    This endpoint uses a separate HTTP request to the streaming API endpoint.
    It runs concurrently with POST /analyze — both are initiated by the frontend
    at the same time.
    """
    client: httpx.AsyncClient = request.app.state.client

    async def event_generator() -> AsyncIterator[str]:
        try:
            # Preprocess the git log (same pipeline as /analyze)
            try:
                prep = preprocess_full(git_log, max_commits=MAX_COMMITS)
            except ValueError as exc:
                yield f"data: [ERROR] {exc}\n\n"
                yield "data: [DONE]\n\n"
                return

            sys_prompt  = get_system_prompt()
            user_prompt = get_user_prompt(prep.formatted_log)
            body        = _build_request_body(sys_prompt, user_prompt)

            url = f"/models/{GEMMA_MODEL}:streamGenerateContent"

            # Open a streaming HTTP connection to Google AI Studio
            async with client.stream(
                "POST",
                url,
                params={"key": API_KEY, "alt": "sse"},
                content=json.dumps(body),
            ) as resp:
                if resp.status_code != 200:
                    err = await resp.aread()
                    try:
                        msg = json.loads(err).get("error", {}).get("message", err[:200])
                    except Exception:
                        msg = err[:200]
                    yield f"data: [ERROR] API error {resp.status_code}: {msg}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Consume SSE lines from Google's streaming response
                # Google sends: "data: {json}\n\n" per chunk
                async for line in resp.aiter_lines():
                    # Check for client disconnect — avoids keeping the Gemma
                    # connection alive after the browser tab closes
                    if await request.is_disconnected():
                        log.info("Client disconnected — closing stream")
                        return

                    line = line.strip()
                    if not line.startswith("data:"):
                        continue

                    raw_chunk = line[5:].strip()
                    if not raw_chunk or raw_chunk == "[DONE]":
                        continue

                    try:
                        chunk_json = json.loads(raw_chunk)
                    except json.JSONDecodeError:
                        continue

                    # Extract text from this chunk
                    try:
                        parts = (
                            chunk_json
                            .get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [])
                        )
                        text = "".join(p.get("text", "") for p in parts)
                    except (IndexError, AttributeError):
                        continue

                    if text:
                        # Escape newlines so SSE framing (double-\n sentinel) stays intact
                        safe = text.replace("\n", "\\n")
                        yield f"data: {safe}\n\n"

        except httpx.TimeoutException:
            yield f"data: [ERROR] Gemma stream timed out after {REQUEST_TIMEOUT:.0f}s\n\n"
        except httpx.RequestError as exc:
            yield f"data: [ERROR] Network error: {exc}\n\n"
        except Exception as exc:
            log.exception("Unexpected error in SSE stream")
            yield f"data: [ERROR] Unexpected error: {type(exc).__name__}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
            "X-Accel-Buffering": "no",   # Disable nginx response buffering
        },
    )

"""
main.py — CodeDNA FastAPI application.

Provides resilient high-performance API services leveraging Gemma 4 MoE.
Features connection-pooled HTTP clients, SSE response token streaming,
multi-model fallback chain, and preprocessing LRU cache.

Required Updates:
  - Primary model = "models/gemma-4-26b-a4b-it"
  - Per-attempt timeout = 22 seconds
  - URL format adaptation for "models/" prefixes.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
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
    ModelEntry,
)
from preprocessor import PreprocessResult, preprocess_full
from prompt import get_system_prompt, get_user_prompt

# Load environment variables from local directory first
backend_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=backend_dir / ".env")

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("codedna")

# ─── Config ───────────────────────────────────────────────────────────────────

API_KEY: str = (
    os.getenv("GEMMA_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or ""
)
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")

# Standardize to models/gemma-4-26b-a4b-it as requested
_PRIMARY_MODEL: str = os.getenv("GEMMA_MODEL", "models/gemma-4-26b-a4b-it")

MAX_COMMITS: int       = int(os.getenv("MAX_COMMITS", "120"))
REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "180"))
PORT: int              = int(os.getenv("PORT", "8000"))

# Strict per-attempt timeout of 25s for speed and fail-fast fallback
ATTEMPT_TIMEOUT: float = float(os.getenv("ATTEMPT_TIMEOUT", "25"))

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

if not API_KEY:
    raise RuntimeError(
        "No API key found. Set GEMINI_API_KEY or GEMMA_API_KEY in backend/.env"
    )

# ─── Multi-provider / Multi-model fallback chain ─────────────────────────────

PROVIDER_CHAIN: list[dict[str, Any]] = [
    {"provider": "google", "model_id": _PRIMARY_MODEL}
]

# Google AI Studio fallback: "models/gemma-4-31b-it"
_GOOGLE_FALLBACK = "models/gemma-4-31b-it"
if _GOOGLE_FALLBACK != _PRIMARY_MODEL:
    PROVIDER_CHAIN.append({"provider": "google", "model_id": _GOOGLE_FALLBACK})

# Keep MODEL_CHAIN in sync for backward compatibility
MODEL_CHAIN: list[str] = [item["model_id"] for item in PROVIDER_CHAIN]

# Track discovered models count for health endpoint
OPENROUTER_MODELS_DISCOVERED: int = 0

log.info(
    "Model chain configured: %s",
    " → ".join(f"[{i}] {m}" for i, m in enumerate(MODEL_CHAIN)),
)

# ─── Preprocessing cache ──────────────────────────────────────────────────────

_PREPROCESS_CACHE: OrderedDict[str, PreprocessResult] = OrderedDict()
_PREPROCESS_CACHE_MAX = 5


def _get_or_preprocess(git_log: str) -> PreprocessResult:
    key = hashlib.md5(git_log.encode(), usedforsecurity=False).hexdigest()
    if key in _PREPROCESS_CACHE:
        _PREPROCESS_CACHE.move_to_end(key)
        log.info("Preprocessor cache hit (key=%s…)", key[:8])
        return _PREPROCESS_CACHE[key]

    result = preprocess_full(git_log, max_commits=MAX_COMMITS)
    _PREPROCESS_CACHE[key] = result
    if len(_PREPROCESS_CACHE) > _PREPROCESS_CACHE_MAX:
        evicted_key, _ = _PREPROCESS_CACHE.popitem(last=False)
        log.debug("Evicted preprocessor cache entry %s…", evicted_key[:8])
    return result


# ─── App lifespan — shared httpx client ───────────────────────────────────────

async def discover_openrouter_models() -> list[str]:
    """
    Query OpenRouter at startup to discover available Gemma models,
    filtering and sorting by quality preference:
      - google/gemma-2-27b-it
      - google/gemma-2-9b-it
      - Any other Gemma models
    """
    if not OPENROUTER_API_KEY:
        log.warning("OPENROUTER_API_KEY not set. Skipping dynamic OpenRouter discovery.")
        return []

    url = "https://openrouter.ai/api/v1/models"
    try:
        log.info("Fetching available models from OpenRouter...")
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"})
            if resp.status_code != 200:
                log.error("OpenRouter models discovery API returned HTTP %d: %s", resp.status_code, resp.text[:200])
                return []
            
            data = resp.json()
            models_list = data.get("data", [])
            gemma_models = []
            for item in models_list:
                m_id = item.get("id")
                if m_id and "gemma" in m_id.lower():
                    gemma_models.append(m_id)

            # Sort intelligently: rank 1 (27b) -> 2 (9b) -> 3 (other gemma-2) -> 4 (other gemma)
            def rank_gemma_model(model_id: str) -> int:
                mid = model_id.lower()
                if "gemma-2-27b" in mid:
                    return 1
                elif "gemma-2-9b" in mid:
                    return 2
                elif "gemma-2" in mid:
                    return 3
                return 4

            gemma_models.sort(key=lambda m: (rank_gemma_model(m), m.lower()))
            log.info("Discovered and sorted %d Gemma models on OpenRouter", len(gemma_models))
            return gemma_models
    except Exception as exc:
        log.exception("Graceful fallback: OpenRouter model discovery failed")
        return []


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 1. Initialize OpenRouter dynamic model discovery
    discovered = await discover_openrouter_models()
    
    global OPENROUTER_MODELS_DISCOVERED
    OPENROUTER_MODELS_DISCOVERED = len(discovered)
    
    for model_id in discovered:
        # Check if already in the chain to avoid duplicates
        if not any(item["model_id"] == model_id for item in PROVIDER_CHAIN):
            PROVIDER_CHAIN.append({"provider": "openrouter", "model_id": model_id})

    # Keep MODEL_CHAIN fully in-sync
    global MODEL_CHAIN
    MODEL_CHAIN.clear()
    MODEL_CHAIN.extend([item["model_id"] for item in PROVIDER_CHAIN])

    log.info(
        "Dynamic Fallback Chain established: %s",
        " → ".join(f"[{i}] {item['provider']}:{item['model_id']}" for i, item in enumerate(PROVIDER_CHAIN))
    )

    # 2. Setup standard client pool
    timeout = httpx.Timeout(
        connect=10.0,
        read=REQUEST_TIMEOUT,   # global safety net
        write=30.0,
        pool=5.0,
    )
    limits = httpx.Limits(
        max_connections=100,
        max_keepalive_connections=50,
        keepalive_expiry=30.0,
    )
    async with httpx.AsyncClient(
        base_url=_API_BASE,
        timeout=timeout,
        limits=limits,
        headers={"Content-Type": "application/json"},
    ) as client:
        app.state.client = client
        log.info(
            "HTTP client ready (primary=%s chain_length=%d timeout=%.0fs)",
            PROVIDER_CHAIN[0]["model_id"], len(PROVIDER_CHAIN), REQUEST_TIMEOUT,
        )
        yield
    log.info("HTTP client closed")


app = FastAPI(
    title="CodeDNA API",
    description="AI Codebase Archaeologist — powered by Gemma 4",
    version="3.0.0",
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
    """Build the Google AI Studio generateContent request body."""
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
            "candidateCount": 1,
        },
        "safetySettings": [
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_ONLY_HIGH",
            }
        ],
    }


def _extract_text_from_response(body: dict[str, Any]) -> str:
    """Pull the generated text from a non-streaming generateContent response."""
    candidates = body.get("candidates")
    if not candidates:
        feedback = body.get("promptFeedback", {})
        reason   = feedback.get("blockReason", "unknown")
        raise ValueError(f"No candidates in response (blockReason={reason})")

    candidate = candidates[0]
    finish    = candidate.get("finishReason", "")

    if finish in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT"):
        raise ValueError(f"Content blocked by safety filters (finishReason={finish})")

    parts = candidate.get("content", {}).get("parts", [])
    if not parts:
        raise ValueError("Candidate has no content parts")

    text = "".join(p.get("text", "") for p in parts if not p.get("thought", False))
    if not text.strip():
        raise ValueError("Model returned empty text")

    return text


def _extract_json_from_text(raw: str) -> dict[str, Any]:
    """Extract JSON object from the model's raw text response."""
    text = raw.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        text  = "\n".join(lines[1:-1]).strip()

    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object in model response. Preview: {raw[:200]!r}")

    return json.loads(text[start:end])


def _classify_status(result: AnalysisResult) -> AnalysisStatus:
    """Detect PARTIAL status: any key narrative field contains 'insufficient_data'."""
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


# ─── Single-model inference call ─────────────────────────────────────────────

async def _call_model_once(
    client: httpx.AsyncClient,
    provider: str,
    model_id: str,
    sys_prompt: str,
    user_prompt: str,
) -> str:
    """Make a single non-streaming generateContent or completions call."""
    if provider == "google":
        # Robust URL formatting that supports clean model_id as well as models/ prefixes
        if model_id.startswith("models/"):
            url = f"/{model_id}:generateContent"
        else:
            url = f"/models/{model_id}:generateContent"
            
        body = _build_request_body(sys_prompt, user_prompt)

        try:
            resp = await client.post(
                url,
                params={"key": API_KEY},
                content=json.dumps(body),
            )
        except httpx.TimeoutException as exc:
            raise asyncio.TimeoutError(
                f"Google model {model_id} timed out (httpx)"
            ) from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"Network error reaching Google AI Studio: {exc}") from exc

        if resp.status_code != 200:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text[:300])
            except Exception:
                detail = resp.text[:300]
            raise RuntimeError(
                f"Google model {model_id} returned HTTP {resp.status_code}: {detail}"
            )

        try:
            raw_text = _extract_text_from_response(resp.json())
        except ValueError as exc:
            raise RuntimeError(f"Google model {model_id} gave unusable response: {exc}") from exc

        return raw_text

    elif provider == "openrouter":
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not configured but OpenRouter was called")

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "CodeDNA"
        }
        
        body = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
        }

        try:
            async with httpx.AsyncClient() as or_client:
                resp = await or_client.post(
                    url,
                    headers=headers,
                    content=json.dumps(body),
                    timeout=ATTEMPT_TIMEOUT,
                )
        except httpx.TimeoutException as exc:
            raise asyncio.TimeoutError(
                f"OpenRouter model {model_id} timed out (httpx)"
            ) from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"Network error reaching OpenRouter: {exc}") from exc

        if resp.status_code != 200:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text[:300])
            except Exception:
                detail = resp.text[:300]
            raise RuntimeError(
                f"OpenRouter model {model_id} returned HTTP {resp.status_code}: {detail}"
            )

        try:
            resp_data = resp.json()
            choices = resp_data.get("choices", [])
            if not choices:
                raise ValueError("No choices in response")
            raw_text = choices[0].get("message", {}).get("content", "")
            if not raw_text.strip():
                raise ValueError("OpenRouter model returned empty content")
            return raw_text
        except Exception as exc:
            raise RuntimeError(f"OpenRouter model {model_id} gave unusable response: {exc}") from exc

    else:
        raise ValueError(f"Unknown provider: {provider}")


# ─── Fallback Engine ──────────────────────────────────────────────────────────

async def _call_model_with_fallback(
    client: httpx.AsyncClient,
    sys_prompt: str,
    user_prompt: str,
) -> tuple[str, str, int, str]:
    """Try each model in PROVIDER_CHAIN in order with exponential backoff on failure."""
    errors: list[str] = []
    backoff_seconds = [1, 2, 3]

    for level, entry in enumerate(PROVIDER_CHAIN):
        provider = entry["provider"]
        model_id = entry["model_id"]
        attempt_label = f"[level={level} provider={provider} model={model_id}]"

        try:
            log.info("Attempting inference %s", attempt_label)

            raw_text = await asyncio.wait_for(
                _call_model_once(client, provider, model_id, sys_prompt, user_prompt),
                timeout=ATTEMPT_TIMEOUT
            )

            log.info("Inference succeeded %s", attempt_label)
            return raw_text, model_id, level, provider

        except asyncio.TimeoutError:
            msg = f"{attempt_label} timed out after {ATTEMPT_TIMEOUT:.0f}s"
            log.warning("%s", msg)
            errors.append(msg)

        except RuntimeError as exc:
            msg = f"{attempt_label} failed: {exc}"
            log.warning("%s", msg)
            errors.append(msg)

        if level < len(PROVIDER_CHAIN) - 1:
            delay = backoff_seconds[min(level, len(backoff_seconds) - 1)]
            log.info("Backing off %.1fs before next model attempt…", delay)
            await asyncio.sleep(delay)

    error_summary = " | ".join(errors)
    raise RuntimeError(
        f"All {len(PROVIDER_CHAIN)} models in fallback chain failed. "
        f"Errors: {error_summary}"
    )


# ─── Degraded-mode messages ───────────────────────────────────────────────────

_DEGRADED_MESSAGES: dict[int, str] = {
    1: (
        f"Using {MODEL_CHAIN[1] if len(MODEL_CHAIN) > 1 else 'fallback model'} "
        "due to high load on primary model. Analysis quality is slightly reduced."
    ),
    2: (
        f"Using {MODEL_CHAIN[2] if len(MODEL_CHAIN) > 2 else 'fallback model'} "
        "due to high load. Reasoning depth may be reduced."
    ),
}


def _make_degraded_message(fallback_level: int) -> str | None:
    if fallback_level == 0:
        return None
    if fallback_level < len(PROVIDER_CHAIN):
        target = PROVIDER_CHAIN[fallback_level]
        return (
            f"Using fallback {target['model_id']} ({target['provider']}) "
            f"due to high load on primary model. Analysis quality may vary."
        )
    return f"Using fallback model (level {fallback_level}). Primary model is temporarily unavailable."


# ─── Core analysis pipeline ───────────────────────────────────────────────────

async def _run_analysis(
    client: httpx.AsyncClient,
    git_log_raw: str,
) -> tuple[AnalysisResult, int, AnalysisStatus, str, int, str]:
    # 1. Preprocess (cached)
    prep = _get_or_preprocess(git_log_raw)
    log.info(
        "Preprocessed: %d→%d commits | quality=%s | tokens≈%d",
        prep.total_parsed, prep.commit_count,
        prep.quality.level, prep.estimated_tokens,
    )

    # 2. Build prompts
    sys_prompt  = get_system_prompt()
    user_prompt = get_user_prompt(prep.formatted_log)

    # 3. Call Gemma Fallback Chain
    raw_text, model_used, fallback_level, provider = await _call_model_with_fallback(
        client, sys_prompt, user_prompt
    )

    # 4. Parse JSON
    try:
        data = _extract_json_from_text(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Model output is not valid JSON: {exc} | "
            f"preview: {raw_text[:300]!r}"
        ) from exc

    # 5. Validate schema
    try:
        result = AnalysisResult.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(
            f"Model output failed schema validation:\n{exc}"
        ) from exc

    status = _classify_status(result)
    return result, prep.commit_count, status, model_used, fallback_level, provider


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness check",
    tags=["Infrastructure"],
)
async def health() -> HealthResponse:
    fallback_models = [item["model_id"] for item in PROVIDER_CHAIN[1:]]
    
    provider_chain = [
        ModelEntry(
            provider=item["provider"],
            model_id=item["model_id"],
            level=idx
        )
        for idx, item in enumerate(PROVIDER_CHAIN)
    ]
    
    return HealthResponse(
        status="ok",
        model=PROVIDER_CHAIN[0]["model_id"],
        max_commits=MAX_COMMITS,
        fallback_models=fallback_models,
        fallback_count=len(fallback_models),
        provider_chain=provider_chain,
        openrouter_models_discovered=OPENROUTER_MODELS_DISCOVERED,
    )


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyse a git log",
    tags=["Analysis"],
)
async def analyze(body: AnalyzeRequest, request: Request) -> AnalyzeResponse:
    client: httpx.AsyncClient = request.app.state.client
    t0 = time.perf_counter()

    try:
        result, commit_count, status, model_used, fallback_level, provider = (
            await _run_analysis(client, body.git_log)
        )
        processing_ms = int((time.perf_counter() - t0) * 1000)

        return AnalyzeResponse(
            success=True,
            status=status,
            result=result,
            commits_preprocessed=commit_count,
            processing_time_ms=processing_ms,
            model_used=model_used,
            fallback_level=fallback_level,
            degraded_mode=(fallback_level > 0),
            degraded_message=_make_degraded_message(fallback_level),
            provider=provider,
        )

    except ValueError as exc:
        log.warning("Invalid input: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    except asyncio.TimeoutError as exc:
        log.error("Outer timeout: %s", exc)
        raise HTTPException(
            status_code=540,
            detail="All models timed out. Please try again in a moment.",
        ) from exc

    except RuntimeError as exc:
        error_str = str(exc)
        if "fallback chain failed" in error_str or "timed out" in error_str.lower():
            log.error("All models failed: %s", exc)
            raise HTTPException(
                status_code=504,
                detail=f"All models unavailable: {error_str}",
            ) from exc
        log.error("Analysis runtime error: %s", exc)
        raise HTTPException(status_code=500, detail=error_str) from exc


@app.post(
    "/analyze/stream",
    summary="Stream Gemma 4 tokens via SSE (POST)",
    tags=["Analysis"],
)
async def analyze_stream(body: AnalyzeRequest, request: Request) -> StreamingResponse:
    client: httpx.AsyncClient = request.app.state.client
    stream_model = MODEL_CHAIN[0]

    async def event_generator() -> AsyncIterator[str]:
        try:
            try:
                prep = _get_or_preprocess(body.git_log)
            except ValueError as exc:
                yield f"data: [ERROR] {exc}\n\n"
                yield "data: [DONE]\n\n"
                return

            sys_prompt  = get_system_prompt()
            user_prompt = get_user_prompt(prep.formatted_log)
            req_body    = _build_request_body(sys_prompt, user_prompt)

            # Adapt URL format to support clean model_id and models/ prefix
            if stream_model.startswith("models/"):
                url = f"/{stream_model}:streamGenerateContent"
            else:
                url = f"/models/{stream_model}:streamGenerateContent"

            async with client.stream(
                "POST",
                url,
                params={"key": API_KEY, "alt": "sse"},
                content=json.dumps(req_body),
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

                async for line in resp.aiter_lines():
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

                    try:
                        parts = (
                            chunk_json
                            .get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [])
                        )
                        # Stream both thoughts and final response text for live terminal view
                        text = "".join(
                            p.get("text", "") for p in parts
                        )
                    except (IndexError, AttributeError):
                        continue

                    if text:
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
            "X-Accel-Buffering": "no",
        },
    )

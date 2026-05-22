"""
models.py — CodeDNA Pydantic v2 schema definitions.

v2 changes:
  - Added HealthBreakdownItem model
  - Added health_breakdown list to AnalysisMetadata
  - Added confidence, commit_count, dominant_files to Milestone
  - Added peak_month_commits, avg_monthly_commits to AnalysisMetrics
  - All new fields have safe defaults (no breaking schema changes)

v3 changes:
  - Added model_used (str) to AnalyzeResponse — records which model actually ran
  - Added fallback_level (int) to AnalyzeResponse — 0=primary, 1=first fallback, etc.
  - Added degraded_mode (bool) to AnalyzeResponse — True when not using primary model
  - Added degraded_message (Optional[str]) to AnalyzeResponse — user-facing note
  - Added model_used and fallback_count to HealthResponse — reflects runtime state

v4 changes:
  - Added provider (str) to AnalyzeResponse — 'google' or 'openrouter'
  - Updated HealthResponse with provider_chain list for full model/provider pairs
  - Supports dynamic OpenRouter model discovery at startup

Design principles:
  - Every field that Gemma 4 outputs is validated against a strict type contract.
  - Enums replace free-text fields wherever the domain is closed.
  - Validators catch malformed/hallucinated values before they reach the frontend.
  - All optional fields have safe defaults so partial Gemma output never crashes.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Annotated, Optional

from pydantic import (
    BaseModel,
    Field,
    field_validator,
    model_validator,
)


# ─── Enums ────────────────────────────────────────────────────────────────────


class MilestoneType(str, Enum):
    BUG_STORM     = "bug_storm"
    REFACTOR      = "refactor"
    PIVOT         = "pivot"
    FEATURE_BURST = "feature_burst"
    STABILITY     = "stability"


class SeverityLevel(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


class DataQuality(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


class AnalysisStatus(str, Enum):
    SUCCESS           = "success"
    PARTIAL           = "partial"
    INSUFFICIENT_DATA = "insufficient_data"
    ERROR             = "error"


class ConfidenceLevel(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


# ─── Shared scalar types ──────────────────────────────────────────────────────

CommitHash = Annotated[
    str,
    Field(min_length=5, max_length=40, pattern=r"^[0-9a-fA-F]{5,40}$"),
]

PeriodString = Annotated[
    str,
    Field(min_length=4, max_length=40),
]


# ─── New: Health score breakdown ──────────────────────────────────────────────


class HealthBreakdownItem(BaseModel):
    """
    One factor contributing to the health score delta-from-50 calculation.
    Displayed in the UI to make the score transparent and trustworthy.
    """
    factor: str = Field(
        ...,
        min_length=1,
        max_length=60,
        description="Short name for the scoring factor",
    )
    delta: int = Field(
        ...,
        ge=-20,
        le=20,
        description="Positive or negative delta applied to base score of 50",
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=250,
        description="One evidence-based sentence citing specific commit data or header metric",
    )

    @field_validator("delta", mode="before")
    @classmethod
    def coerce_delta(cls, v: object) -> int:
        if isinstance(v, (int, float)):
            return max(-20, min(20, int(v)))
        raise ValueError("delta must be numeric")


# ─── Sub-models ───────────────────────────────────────────────────────────────


class Milestone(BaseModel):
    """
    A single discrete event in the codebase's history.
    v2: adds confidence, commit_count, and dominant_files.
    """

    id: str = Field(..., min_length=1, max_length=80)
    period: PeriodString = Field(..., description="'YYYY-MM' or 'YYYY-MM to YYYY-MM'")
    type: MilestoneType = Field(...)
    title: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=10, max_length=800)
    severity: SeverityLevel = Field(...)
    commit_hashes: list[str] = Field(default_factory=list, max_length=10)

    # v2 additions — all optional with safe defaults
    commit_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Number of commits in this milestone window",
    )
    dominant_files: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Most-affected file paths in this milestone",
    )
    confidence: ConfidenceLevel = Field(
        default=ConfidenceLevel.MEDIUM,
        description="Confidence in this milestone classification",
    )

    @field_validator("commit_hashes", mode="before")
    @classmethod
    def clean_commit_hashes(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        cleaned: list[str] = []
        for item in v:
            if not isinstance(item, str):
                continue
            item = item.strip()
            if re.fullmatch(r"[0-9a-fA-F]{5,40}", item):
                cleaned.append(item.lower())
        return cleaned[:10]

    @field_validator("dominant_files", mode="before")
    @classmethod
    def clean_dominant_files(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        cleaned = [str(f).strip() for f in v if isinstance(f, str) and f.strip()]
        return cleaned[:5]

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_text(cls, v: object) -> str:
        if isinstance(v, str):
            return v.strip()
        raise ValueError("Field must be a string")

    @field_validator("confidence", mode="before")
    @classmethod
    def coerce_confidence(cls, v: object) -> ConfidenceLevel:
        if isinstance(v, str):
            try:
                return ConfidenceLevel(v.lower())
            except ValueError:
                return ConfidenceLevel.MEDIUM
        return ConfidenceLevel.MEDIUM


class AnalysisMetadata(BaseModel):
    """
    High-level stats about the analysis run.
    v2: adds health_breakdown for transparent score display.
    """

    commits_analyzed: int = Field(..., ge=1)
    time_span_days: int = Field(..., ge=0)
    time_span_readable: str = Field(..., min_length=1, max_length=60)
    health_score: int = Field(..., ge=0, le=100)
    health_justification: str = Field(..., min_length=20, max_length=500)
    health_breakdown: list[HealthBreakdownItem] = Field(
        default_factory=list,
        max_length=8,
        description="Breakdown of health score factors — displayed in UI",
    )

    @field_validator("health_score", mode="before")
    @classmethod
    def coerce_health_score(cls, v: object) -> int:
        if isinstance(v, (int, float)):
            return max(0, min(100, int(v)))
        raise ValueError(f"health_score must be numeric, got {type(v).__name__}")

    @field_validator("health_breakdown", mode="before")
    @classmethod
    def coerce_breakdown(cls, v: object) -> list:
        if not isinstance(v, list):
            return []
        return v


class AnalysisMetrics(BaseModel):
    """
    Derived metrics computed by Gemma 4 from the commit corpus.
    v2: adds peak_month_commits and avg_monthly_commits.
    """

    most_chaotic_period: str = Field(..., min_length=4, max_length=20)
    most_stable_period: str = Field(..., min_length=4, max_length=20)
    biggest_pivot_commit: Optional[str] = Field(default=None)
    bug_fix_ratio: str = Field(..., min_length=1, max_length=20)

    # v2 additions — optional with safe defaults
    peak_month_commits: Optional[int] = Field(
        default=None,
        ge=0,
        description="Highest commit count in any single month (from MONTHLY_COMMIT_COUNTS)",
    )
    avg_monthly_commits: Optional[float] = Field(
        default=None,
        ge=0,
        description="Mean commits per month across analyzed window",
    )

    @field_validator("biggest_pivot_commit", mode="before")
    @classmethod
    def normalize_pivot_commit(cls, v: object) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("null", "none", "n/a", "insufficient_data", ""):
                return None
            if re.fullmatch(r"[0-9a-fA-F]{5,40}", v.strip()):
                return v.strip().lower()
        return None

    @field_validator("bug_fix_ratio", mode="before")
    @classmethod
    def normalize_ratio(cls, v: object) -> str:
        if isinstance(v, (int, float)):
            return f"{int(v)}%"
        if isinstance(v, str):
            s = v.strip()
            if s and not s.endswith("%"):
                return f"{s}%"
            return s
        raise ValueError("bug_fix_ratio must be a string or number")

    @field_validator("peak_month_commits", "avg_monthly_commits", mode="before")
    @classmethod
    def coerce_numeric(cls, v: object) -> Optional[float]:
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return None
        if isinstance(v, (int, float)):
            return v
        return None


class ReasoningSummary(BaseModel):
    """Optional structured summary of Gemma's thinking tokens."""

    key_observations: list[str] = Field(default_factory=list, max_length=10)
    confidence_notes: Optional[str] = Field(default=None, max_length=400)
    reasoning_token_count: Optional[int] = Field(default=None, ge=0)


# ─── Root analysis result ─────────────────────────────────────────────────────


class AnalysisResult(BaseModel):
    """
    The complete structured output from one Gemma 4 analysis call.
    All fields mirror the master system prompt JSON schema in prompt.py exactly.
    """

    metadata: AnalysisMetadata = Field(...)
    summary: str = Field(..., min_length=20, max_length=1200)
    milestones: list[Milestone] = Field(..., min_length=1, max_length=20)
    metrics: AnalysisMetrics = Field(...)
    churn_summary: str = Field(..., min_length=10, max_length=500)
    data_quality: DataQuality = Field(...)
    reasoning: Optional[ReasoningSummary] = Field(default=None)

    @model_validator(mode="after")
    def validate_milestone_ids_unique(self) -> "AnalysisResult":
        """De-duplicate milestone IDs if Gemma returns duplicates."""
        ids = [m.id for m in self.milestones]
        if len(ids) != len(set(ids)):
            seen: dict[str, int] = {}
            for m in self.milestones:
                if m.id in seen:
                    seen[m.id] += 1
                    m.id = f"{m.id}_{seen[m.id]}"
                else:
                    seen[m.id] = 0
        return self

    @field_validator("summary", "churn_summary", mode="before")
    @classmethod
    def strip_narrative_fields(cls, v: object) -> str:
        if isinstance(v, str):
            return v.strip()
        raise ValueError("Narrative fields must be strings")


# ─── Request / Response wrappers ──────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    """Inbound payload for POST /analyze and POST /analyze/stream."""

    git_log: str = Field(
        ...,
        min_length=10,
        description="Raw git log text pasted by the user (any supported format)",
    )

    @field_validator("git_log", mode="before")
    @classmethod
    def validate_git_log(cls, v: object) -> str:
        if not isinstance(v, str):
            raise ValueError("git_log must be a string")
        stripped = v.strip()
        if len(stripped) < 10:
            raise ValueError("Input is too short to be a valid git log")
        if not re.search(r"\b[0-9a-fA-F]{5,40}\b", stripped):
            raise ValueError(
                "Input does not appear to be a valid git log. "
                "Expected format: git log --oneline [--stat]"
            )
        return stripped


class AnalyzeResponse(BaseModel):
    """
    Outbound payload for POST /analyze.

    v3 additions:
      - model_used: exact model ID that produced the result (e.g. 'gemma-4-31b-it')
      - fallback_level: 0 = primary succeeded, 1 = first fallback used, etc.
      - degraded_mode: True when fallback_level > 0 (frontend can show a warning badge)
      - degraded_message: user-facing explanation when degraded (e.g. 'Using lighter model
        due to high load on primary model.')

    v4 additions:
      - provider: inference provider that served the request ('google' or 'openrouter')
    """

    success: bool = Field(...)
    status: AnalysisStatus = Field(...)
    result: Optional[AnalysisResult] = Field(default=None)
    error: Optional[str] = Field(default=None, max_length=500)
    commits_preprocessed: int = Field(default=0, ge=0)
    processing_time_ms: Optional[int] = Field(
        default=None,
        description="End-to-end processing time in milliseconds",
    )

    # ── v3: Multi-model fallback tracking ────────────────────────────────────
    model_used: str = Field(
        default="unknown",
        description="Exact model ID that produced this analysis result",
    )
    fallback_level: int = Field(
        default=0,
        ge=0,
        description=(
            "0 = primary model succeeded. "
            "Increments for each fallback level attempted."
        ),
    )
    degraded_mode: bool = Field(
        default=False,
        description="True when fallback_level > 0 — primary model was unavailable",
    )
    degraded_message: Optional[str] = Field(
        default=None,
        max_length=300,
        description="User-facing explanation shown in the UI when degraded_mode=True",
    )

    # ── v4: Multi-provider tracking ───────────────────────────────────────────
    provider: str = Field(
        default="google",
        description="Inference provider: 'google' (AI Studio) or 'openrouter'",
    )

    # ── Cache tracking ───────────────────────────────────────────────────────
    cached: bool = Field(
        default=False,
        description="True when result came from cache"
    )
    cache_key: str = Field(
        default="",
        description="MD5 hash key used for cache lookup"
    )

    @model_validator(mode="after")
    def validate_consistency(self) -> "AnalyzeResponse":
        if self.success and self.result is None:
            raise ValueError("success=True requires a non-null result")
        if not self.success and self.error is None:
            raise ValueError("success=False requires an error message")
        # Auto-set degraded_mode from fallback_level if not explicitly provided
        if self.fallback_level > 0 and not self.degraded_mode:
            self.degraded_mode = True
        return self


class ModelEntry(BaseModel):
    """
    One entry in the provider_chain — a (provider, model_id) pair.
    Sent in /health so the frontend can display which models are available.
    """

    provider: str = Field(..., description="'google' or 'openrouter'")
    model_id: str = Field(..., description="Full model identifier string")
    level: int = Field(..., ge=0, description="Position in fallback chain (0 = primary)")


class HealthResponse(BaseModel):
    """
    Outbound payload for GET /health.
    v3: adds model_used and fallback_count for runtime introspection.
    v4: adds provider_chain for full multi-provider visibility.
    """

    status: str = Field(default="ok")
    model: str = Field(...)
    max_commits: int = Field(..., ge=1)

    # v3 additions — reflects which model is currently primary and how many
    # fallbacks are configured in the chain.
    fallback_models: list[str] = Field(
        default_factory=list,
        description="Ordered list of fallback model IDs (excluding primary)",
    )
    fallback_count: int = Field(
        default=0,
        ge=0,
        description="Number of fallback models available after the primary",
    )

    # v4 additions — full provider/model pair chain for introspection
    provider_chain: list[ModelEntry] = Field(
        default_factory=list,
        description="Ordered list of (provider, model_id) pairs in fallback priority",
    )
    openrouter_models_discovered: int = Field(
        default=0,
        ge=0,
        description="Number of Gemma models discovered from OpenRouter at startup",
    )


class ErrorResponse(BaseModel):
    """Structured error envelope for all 4xx / 5xx responses."""

    success: bool = Field(default=False)
    status: AnalysisStatus = Field(default=AnalysisStatus.ERROR)
    error: str = Field(..., min_length=1, max_length=500)
    error_code: Optional[str] = Field(default=None)

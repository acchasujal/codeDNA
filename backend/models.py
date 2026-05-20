"""
models.py — CodeDNA Pydantic v2 schema definitions.

Design principles:
  - Every field that Gemma 4 outputs is validated against a strict type contract.
  - Enums replace free-text fields wherever the domain is closed.
  - Validators catch malformed/hallucinated values before they reach the frontend.
  - All optional fields have safe defaults so partial Gemma output never crashes.
  - Field descriptions double as prompt documentation — keep them accurate.
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
    """
    Closed set of milestone categories returned by Gemma 4.
    Maps directly to timeline color coding on the frontend.
    """
    BUG_STORM     = "bug_storm"       # Red  — dense cluster of fix/hotfix commits
    REFACTOR      = "refactor"        # Amber — structural cleanup, rename, extract
    PIVOT         = "pivot"           # Green — direction change, new framework/arch
    FEATURE_BURST = "feature_burst"   # Blue  — high-velocity feature additions
    STABILITY     = "stability"       # Gray  — low churn, maintenance cadence


class SeverityLevel(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


class DataQuality(str, Enum):
    """
    Reflects the quality of the raw commit messages fed to Gemma 4.
    Low quality (e.g. all "fix", "update", "wip") limits analysis confidence.
    """
    HIGH   = "high"    # Descriptive messages, dates, scopes
    MEDIUM = "medium"  # Mixed quality, some vague entries
    LOW    = "low"     # Mostly terse/uninformative messages


class AnalysisStatus(str, Enum):
    SUCCESS            = "success"
    PARTIAL            = "partial"           # Some fields were insufficient_data
    INSUFFICIENT_DATA  = "insufficient_data" # Too few commits or too vague
    ERROR              = "error"


# ─── Shared scalar types ──────────────────────────────────────────────────────

# Short hash or null string from Gemma output
CommitHash = Annotated[
    str,
    Field(min_length=5, max_length=40, pattern=r"^[0-9a-fA-F]{5,40}$"),
]

# YYYY-MM or "YYYY-MM to YYYY-MM" period strings produced by Gemma
PeriodString = Annotated[
    str,
    Field(min_length=4, max_length=40),
]


# ─── Sub-models ───────────────────────────────────────────────────────────────


class Milestone(BaseModel):
    """
    A single discrete event in the codebase's history.
    Every milestone Gemma returns must have all required fields.
    Optional fields fall back to safe defaults if Gemma omits them.
    """

    id: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Unique identifier for this milestone (slug or UUID from model)",
    )
    period: PeriodString = Field(
        ...,
        description="Time range: 'YYYY-MM' or 'YYYY-MM to YYYY-MM'",
    )
    type: MilestoneType = Field(
        ...,
        description="Category driving timeline color: bug_storm | refactor | pivot | feature_burst | stability",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Short human title, max 6 words",
    )
    description: str = Field(
        ...,
        min_length=10,
        max_length=600,
        description="2–3 sentences with specific commit or pattern evidence",
    )
    severity: SeverityLevel = Field(
        ...,
        description="Impact severity: high | medium | low",
    )
    commit_hashes: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="Up to 10 representative commit hashes from this milestone",
    )

    @field_validator("commit_hashes", mode="before")
    @classmethod
    def clean_commit_hashes(cls, v: object) -> list[str]:
        """
        Normalize and filter commit hashes.
        Gemma sometimes returns null, full SHAs, or mixed-format lists.
        """
        if not isinstance(v, list):
            return []
        cleaned: list[str] = []
        for item in v:
            if not isinstance(item, str):
                continue
            item = item.strip()
            # Accept any hex string between 5 and 40 chars
            if re.fullmatch(r"[0-9a-fA-F]{5,40}", item):
                cleaned.append(item.lower())
        return cleaned[:10]  # cap defensively

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v: object) -> str:
        if isinstance(v, str):
            return v.strip()
        raise ValueError("title must be a string")

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v: object) -> str:
        if isinstance(v, str):
            return v.strip()
        raise ValueError("description must be a string")


class AnalysisMetadata(BaseModel):
    """
    High-level stats about the analysis run.
    All integers must be non-negative; health_score is bounded 0–100.
    """

    commits_analyzed: int = Field(
        ...,
        ge=1,
        description="Number of commits actually processed (after capping)",
    )
    time_span_days: int = Field(
        ...,
        ge=0,
        description="Total days covered by the analyzed commit window",
    )
    time_span_readable: str = Field(
        ...,
        min_length=1,
        max_length=60,
        description="Human-readable span, e.g. '2 years 4 months'",
    )
    health_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Overall codebase health 0–100 (higher = healthier)",
    )
    health_justification: str = Field(
        ...,
        min_length=20,
        max_length=400,
        description="Two sentences grounding the score in specific commit evidence",
    )

    @field_validator("health_score", mode="before")
    @classmethod
    def coerce_health_score(cls, v: object) -> int:
        """Clamp to [0, 100] even if Gemma overshoots."""
        if isinstance(v, (int, float)):
            return max(0, min(100, int(v)))
        raise ValueError(f"health_score must be numeric, got {type(v).__name__}")


class AnalysisMetrics(BaseModel):
    """
    Derived metrics computed by Gemma 4 from the commit corpus.
    Fields use Optional with None defaults so partial output is safe.
    """

    most_chaotic_period: str = Field(
        ...,
        min_length=4,
        max_length=20,
        description="YYYY-MM of the period with highest bug/fix density",
    )
    most_stable_period: str = Field(
        ...,
        min_length=4,
        max_length=20,
        description="YYYY-MM of the period with lowest churn rate",
    )
    biggest_pivot_commit: Optional[str] = Field(
        default=None,
        description="Commit hash of the single most pivotal architectural change, or null",
    )
    bug_fix_ratio: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Percentage of commits containing fix/bug/hotfix keywords, e.g. '23%'",
    )

    @field_validator("biggest_pivot_commit", mode="before")
    @classmethod
    def normalize_pivot_commit(cls, v: object) -> Optional[str]:
        """
        Gemma sometimes outputs 'null' as a literal string, or an empty string.
        Normalize all of those to Python None.
        """
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
        """Accept both '23%' and '23' from Gemma; always store with % suffix."""
        if isinstance(v, (int, float)):
            return f"{int(v)}%"
        if isinstance(v, str):
            s = v.strip()
            if s and not s.endswith("%"):
                return f"{s}%"
            return s
        raise ValueError("bug_fix_ratio must be a string or number")


class ReasoningSummary(BaseModel):
    """
    Optional structured summary of Gemma's thinking tokens.
    Populated by the SSE stream consumer on the frontend side;
    stored here for Markdown export completeness.
    """

    key_observations: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="Up to 10 bullet-point observations from the reasoning trace",
    )
    confidence_notes: Optional[str] = Field(
        default=None,
        max_length=400,
        description="Any caveats Gemma raised during reasoning about data quality",
    )
    reasoning_token_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Number of thinking tokens streamed (informational only)",
    )


# ─── Root analysis result ─────────────────────────────────────────────────────


class AnalysisResult(BaseModel):
    """
    The complete structured output from one Gemma 4 analysis call.
    This is the canonical payload stored in memory and returned to the frontend.
    All fields mirror the master system prompt JSON schema in prompt.py exactly.
    """

    metadata: AnalysisMetadata = Field(
        ...,
        description="High-level stats: commit count, time span, health score",
    )
    summary: str = Field(
        ...,
        min_length=20,
        max_length=1000,
        description="3–4 sentence factual narrative of the codebase's life story",
    )
    milestones: list[Milestone] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Ordered list of key historical milestones (newest-last is fine)",
    )
    metrics: AnalysisMetrics = Field(
        ...,
        description="Derived quantitative metrics from commit pattern analysis",
    )
    churn_summary: str = Field(
        ...,
        min_length=10,
        max_length=400,
        description="One factual sentence about churn referencing a specific date range",
    )
    data_quality: DataQuality = Field(
        ...,
        description="Quality of the source commit messages: high | medium | low",
    )
    reasoning: Optional[ReasoningSummary] = Field(
        default=None,
        description="Optional summary of Gemma's thinking trace (populated post-stream)",
    )

    @model_validator(mode="after")
    def validate_milestone_ids_unique(self) -> AnalysisResult:
        """Guard against Gemma returning duplicate milestone IDs."""
        ids = [m.id for m in self.milestones]
        if len(ids) != len(set(ids)):
            # De-duplicate by appending index rather than rejecting outright
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
    """Inbound payload for POST /analyze."""

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
        # Must contain at least one plausible commit hash (5+ hex chars)
        if not re.search(r"\b[0-9a-fA-F]{5,40}\b", stripped):
            raise ValueError(
                "Input does not appear to be a valid git log. "
                "Expected format: git log --oneline [--stat]"
            )
        return stripped


class AnalyzeResponse(BaseModel):
    """Outbound payload for POST /analyze."""

    success: bool = Field(..., description="True if analysis completed without error")
    status: AnalysisStatus = Field(
        ...,
        description="Detailed outcome: success | partial | insufficient_data | error",
    )
    result: Optional[AnalysisResult] = Field(
        default=None,
        description="Full analysis result — present when success=True",
    )
    error: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Human-readable error message — present when success=False",
    )
    commits_preprocessed: int = Field(
        default=0,
        ge=0,
        description="Number of commits that reached the model after preprocessing",
    )

    @model_validator(mode="after")
    def validate_consistency(self) -> AnalyzeResponse:
        """Enforce that success and result/error are coherent."""
        if self.success and self.result is None:
            raise ValueError("success=True requires a non-null result")
        if not self.success and self.error is None:
            raise ValueError("success=False requires an error message")
        return self


class HealthResponse(BaseModel):
    """Outbound payload for GET /health."""

    status: str = Field(default="ok", description="Service liveness: 'ok'")
    model: str = Field(..., description="Gemma model identifier in use")
    max_commits: int = Field(..., ge=1, description="Commit cap applied by the preprocessor")


class ErrorResponse(BaseModel):
    """
    Structured error envelope for all 4xx / 5xx responses.
    Returned by FastAPI exception handlers — not from Pydantic validation paths.
    """

    success: bool = Field(default=False)
    status: AnalysisStatus = Field(default=AnalysisStatus.ERROR)
    error: str = Field(..., min_length=1, max_length=500, description="Error detail")
    error_code: Optional[str] = Field(
        default=None,
        description="Machine-readable code: INVALID_INPUT | API_FAILURE | PARSE_ERROR | TIMEOUT",
    )

"""
preprocessor.py — Git log parser and token optimizer for CodeDNA.

Pipeline:
  raw text  →  parse_commits()  →  score_quality()
            →  compress()       →  truncate()
            →  format_for_llm() →  PreprocessResult

Design goals:
  - Maximum analytical signal per token sent to Gemma 4.
  - Zero external dependencies beyond stdlib.
  - Safe on weak hardware: O(n) passes, no quadratic ops.
  - Deterministic output for the same input (no randomness).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

MAX_COMMITS: int     = int(os.getenv("MAX_COMMITS", "400"))
TINY_REPO_THRESHOLD  = 50    # commits — triggers micro-analysis label
LOW_QUALITY_RATIO    = 0.60  # if ≥60 % of messages are vague → quality=low
MED_QUALITY_RATIO    = 0.30  # if ≥30 % vague → quality=medium
# Approximate chars-per-token for Gemma tokenizer (conservative estimate)
_CHARS_PER_TOKEN     = 3.8

# Commit messages that carry essentially zero analytical signal
_VAGUE_PATTERNS: re.Pattern[str] = re.compile(
    r"^\s*("
    r"fix"
    r"|fixes"
    r"|fixed"
    r"|bug"
    r"|hotfix"
    r"|update"
    r"|updates"
    r"|updated"
    r"|wip"
    r"|misc"
    r"|temp"
    r"|test"
    r"|tests"
    r"|cleanup"
    r"|clean"
    r"|changes"
    r"|change"
    r"|stuff"
    r"|done"
    r"|ok"
    r"|patch"
    r"|minor"
    r"|refactor"
    r"|typo"
    r"|lint"
    r"|fmt"
    r"|format"
    r"|merge"
    r"|revert"
    r"|revision"
    r"|."          # single char
    r"|[0-9]+"     # pure numbers
    r")\s*\.?$",
    re.IGNORECASE,
)

# Patterns that indicate bug-fixing activity (used for ratio calculation)
_BUG_FIX_PATTERN: re.Pattern[str] = re.compile(
    r"\b(fix|fixes|fixed|bug|hotfix|patch|revert|regression|broken|crash|error|exception)\b",
    re.IGNORECASE,
)

# Merge commit detector — these are low-signal noise in --oneline logs
_MERGE_PATTERN: re.Pattern[str] = re.compile(
    r"^merge\s+(branch|pull\s+request|remote|tag)",
    re.IGNORECASE,
)

# ─── Commit line parsers ──────────────────────────────────────────────────────
# git log --oneline:            <hash> <message>
# git log --oneline --date=...: <hash> <date> <message>  (rare variant)
# git log --format="%h %ad %s": <hash> <date> <message>
# We extract what we can; date is optional since many paste styles omit it.

_ONELINE_RE: re.Pattern[str] = re.compile(
    r"^([0-9a-f]{5,40})"          # group 1: hash (5–40 hex chars)
    r"(?:\s+\(.*?\))?"            # optional: ref decorations (HEAD -> main)
    r"\s+(.*?)$",                  # group 2: remainder = date? + message
    re.IGNORECASE,
)

# ISO date embedded in the remainder: "2023-04-15" or "2023-04-15T..."
_DATE_RE: re.Pattern[str] = re.compile(
    r"\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b"
)

# --stat summary lines  ("3 files changed, 12 insertions(+), 2 deletions(-)")
_STAT_SUMMARY_RE: re.Pattern[str] = re.compile(
    r"^\s*\d+\s+files?\s+changed",
    re.IGNORECASE,
)

# --stat file lines  ("src/App.tsx  |  42 ++---")
_STAT_FILE_RE: re.Pattern[str] = re.compile(
    r"^\s*[\w/.\-]+\s*\|\s*\d+"
)

# --numstat lines  ("12   4   src/App.tsx")
_NUMSTAT_RE: re.Pattern[str] = re.compile(
    r"^\s*(\d+|-)\s+(\d+|-)\s+(.+)$"
)

# Blank/separator lines we always skip
_BLANK_RE: re.Pattern[str] = re.compile(r"^\s*$")


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass(slots=True)
class ParsedCommit:
    """One commit extracted from the raw log."""
    hash:       str
    message:    str
    date:       Optional[str]  = None   # "YYYY-MM-DD" if extractable
    insertions: int            = 0
    deletions:  int            = 0
    files_changed: int         = 0
    is_merge:   bool           = False
    is_vague:   bool           = False
    is_bug_fix: bool           = False


@dataclass
class QualityScore:
    """Commit message quality assessment for the entire log."""
    level:        str   = "high"   # "high" | "medium" | "low"
    vague_count:  int   = 0
    total_count:  int   = 0
    vague_ratio:  float = 0.0
    bug_fix_count: int  = 0

    @property
    def bug_fix_ratio_pct(self) -> str:
        if self.total_count == 0:
            return "0%"
        return f"{round(self.bug_fix_count / self.total_count * 100)}%"


@dataclass
class PreprocessResult:
    """Everything the analysis pipeline needs; returned to main.py."""
    formatted_log:   str           # compact text ready to inject into prompt
    commit_count:    int           # how many commits reached the model
    total_parsed:    int           # how many were in the raw log before capping
    quality:         QualityScore
    is_tiny_repo:    bool          # True if commit_count < TINY_REPO_THRESHOLD
    estimated_tokens: int          # rough estimate for logging/cost awareness
    date_range:      Optional[tuple[str, str]] = None  # (earliest, latest) YYYY-MM-DD
    metadata_header: str           = field(default="")  # prepended to formatted_log


# ─── Parsing ──────────────────────────────────────────────────────────────────

def _is_vague(message: str) -> bool:
    """Return True if the commit message carries no analytical signal."""
    msg = message.strip()
    if len(msg) < 4:
        return True
    if msg.endswith("..."):
        # Truncated by git log length limit — not vague, just cut off
        return False
    return bool(_VAGUE_PATTERNS.match(msg))


_MONTH_MAP: dict[str, str] = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
}


def _parse_any_date(text: str) -> Optional[str]:
    """Extract and format the date string, supporting both ISO format and standard git format."""
    # 1. Try ISO date format first
    iso_m = _DATE_RE.search(text)
    if iso_m:
        return iso_m.group(1)
    
    # 2. Try standard git date format: "Wed Mar 11 16:32:00 2026 -0400"
    m = re.search(
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+(\d{4})",
        text,
        re.IGNORECASE
    )
    if m:
        month_str, day_str, year_str = m.group(1), m.group(2), m.group(3)
        day_str = f"0{day_str}" if len(day_str) == 1 else day_str
        month_str = month_str.capitalize()
        month_num = _MONTH_MAP.get(month_str[:3], "01")
        return f"{year_str}-{month_num}-{day_str}"
    return None


def _extract_stat_churn(lines: list[str], start_idx: int) -> tuple[int, int, int]:
    """
    Scan lines immediately after a commit line for --stat churn data.
    Returns (insertions, deletions, files_changed).
    Stops when it hits another commit line or runs out of lines.
    """
    insertions = deletions = files_changed = 0
    i = start_idx
    while i < len(lines):
        line = lines[i]
        # Stat summary line: "3 files changed, 12 insertions(+), 2 deletions(-)"
        if _STAT_SUMMARY_RE.match(line):
            ins_m = re.search(r"(\d+)\s+insertion", line)
            del_m = re.search(r"(\d+)\s+deletion",  line)
            fch_m = re.search(r"(\d+)\s+files?\s+changed", line)
            if ins_m: insertions    = int(ins_m.group(1))
            if del_m: deletions     = int(del_m.group(1))
            if fch_m: files_changed = int(fch_m.group(1))
            break
        # Stat file line — count files but don't stop yet
        if _STAT_FILE_RE.match(line):
            i += 1
            continue
        # numstat line
        ns = _NUMSTAT_RE.match(line)
        if ns:
            ins_s, del_s = ns.group(1), ns.group(2)
            if ins_s != "-": insertions    += int(ins_s)
            if del_s != "-": deletions     += int(del_s)
            files_changed += 1
            i += 1
            continue
        # Blank line between commits — keep scanning
        if _BLANK_RE.match(line):
            i += 1
            continue
        # Hit what looks like the next commit — stop
        break
    return insertions, deletions, files_changed


def parse_commits(raw_log: str) -> list[ParsedCommit]:
    """
    Parse a raw git log string into a list of ParsedCommit objects.

    Supports: --oneline, --oneline --stat, --oneline --numstat,
              --format="%h %ad %s", standard multi-line git logs (commit <hash>), and mixed pastes.

    Raises:
        ValueError: If no recognisable commit lines are found.
    """
    lines = raw_log.splitlines()
    commits: list[ParsedCommit] = []
    
    # Detect if the log is in full multi-line commit format
    has_full_commit_lines = any(re.match(r"^commit\s+[0-9a-f]{5,40}", line.strip(), re.IGNORECASE) for line in lines)
    
    if has_full_commit_lines:
        i = 0
        current_commit = None
        message_lines = []
        
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            commit_match = re.match(r"^commit\s+([0-9a-f]{5,40})", stripped, re.IGNORECASE)
            if commit_match:
                # If there's a previous commit, save it
                if current_commit:
                    if message_lines:
                        current_commit.message = message_lines[0]
                    current_commit.is_merge = bool(_MERGE_PATTERN.match(current_commit.message))
                    current_commit.is_vague = _is_vague(current_commit.message)
                    current_commit.is_bug_fix = bool(_BUG_FIX_PATTERN.search(current_commit.message))
                    commits.append(current_commit)
                
                # Start new commit
                h = commit_match.group(1).lower()
                current_commit = ParsedCommit(hash=h, message="")
                message_lines = []
                i += 1
                continue
            
            if current_commit:
                if stripped.lower().startswith("author:"):
                    i += 1
                    continue
                elif stripped.lower().startswith("date:"):
                    current_commit.date = _parse_any_date(stripped)
                    i += 1
                    continue
                
                # Check for stat/churn lines
                if _STAT_SUMMARY_RE.match(stripped) or _STAT_FILE_RE.match(stripped) or _NUMSTAT_RE.match(stripped):
                    ins, dels, files = _extract_stat_churn(lines, i)
                    current_commit.insertions = ins
                    current_commit.deletions = dels
                    current_commit.files_changed = files
                    # Skip past the processed stat lines
                    while i < len(lines):
                        nxt = lines[i].strip()
                        if _STAT_SUMMARY_RE.match(nxt) or _STAT_FILE_RE.match(nxt) or _NUMSTAT_RE.match(nxt) or not nxt:
                            i += 1
                        else:
                            break
                    continue
                
                # Collect message line
                if stripped:
                    message_lines.append(stripped)
            
            i += 1
            
        if current_commit:
            if message_lines:
                current_commit.message = message_lines[0]
            current_commit.is_merge = bool(_MERGE_PATTERN.match(current_commit.message))
            current_commit.is_vague = _is_vague(current_commit.message)
            current_commit.is_bug_fix = bool(_BUG_FIX_PATTERN.search(current_commit.message))
            commits.append(current_commit)
            
    else:
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            if (not stripped
                    or _BLANK_RE.match(stripped)
                    or _STAT_SUMMARY_RE.match(stripped)
                    or _STAT_FILE_RE.match(stripped)
                    or _NUMSTAT_RE.match(stripped)):
                i += 1
                continue

            m = _ONELINE_RE.match(stripped)
            if not m:
                i += 1
                continue

            commit_hash = m.group(1).lower()
            remainder   = m.group(2).strip()

            date = _parse_any_date(remainder)
            if date:
                message = _DATE_RE.sub("", remainder).strip(" -T|")
            else:
                message = remainder

            message = re.sub(r"^\(.*?\)\s*", "", message).strip()
            ins, dels, files = _extract_stat_churn(lines, i + 1)

            is_merge   = bool(_MERGE_PATTERN.match(message))
            is_vague   = _is_vague(message)
            is_bug_fix = bool(_BUG_FIX_PATTERN.search(message))

            commits.append(ParsedCommit(
                hash          = commit_hash,
                message       = message,
                date          = date,
                insertions    = ins,
                deletions     = dels,
                files_changed = files,
                is_merge      = is_merge,
                is_vague      = is_vague,
                is_bug_fix    = is_bug_fix,
            ))
            i += 1

    if not commits:
        raise ValueError(
            "No recognisable git commit lines found. "
            "Paste the output of: git log --oneline [--stat]"
        )

    log.debug("Parsed %d raw commits from input", len(commits))
    return commits


# ─── Quality scoring ──────────────────────────────────────────────────────────

def score_quality(commits: list[ParsedCommit]) -> QualityScore:
    """
    Assess the analytical quality of the commit message corpus.
    Merge commits are excluded from the quality calculation (they're structural noise).
    """
    non_merge = [c for c in commits if not c.is_merge]
    total     = len(non_merge)

    if total == 0:
        return QualityScore(level="low", total_count=0)

    vague_count   = sum(1 for c in non_merge if c.is_vague)
    bug_fix_count = sum(1 for c in non_merge if c.is_bug_fix)
    vague_ratio   = vague_count / total

    if vague_ratio >= LOW_QUALITY_RATIO:
        level = "low"
    elif vague_ratio >= MED_QUALITY_RATIO:
        level = "medium"
    else:
        level = "high"

    return QualityScore(
        level         = level,
        vague_count   = vague_count,
        total_count   = total,
        vague_ratio   = vague_ratio,
        bug_fix_count = bug_fix_count,
    )


# ─── Compression ──────────────────────────────────────────────────────────────

def compress_commits(commits: list[ParsedCommit]) -> list[ParsedCommit]:
    """
    Reduce token waste by collapsing runs of near-identical low-signal commits.

    Strategy:
      - Consecutive merge commits → keep first, discard rest.
      - Runs of ≥4 consecutive vague commits of the same type → keep first
        and last, replace middle with a summary sentinel.
      - Pure dependency-bump commits ("bump X from Y to Z") → keep one per month.

    This preserves the analytical shape of the history without sending
    hundreds of "fix" commits to the model.
    """
    if len(commits) <= 8:
        # Tiny repo — preserve everything as-is
        return commits

    compressed: list[ParsedCommit] = []
    i = 0

    while i < len(commits):
        c = commits[i]

        # Collapse merge commit runs
        if c.is_merge:
            j = i
            while j < len(commits) and commits[j].is_merge:
                j += 1
            run_len = j - i
            compressed.append(c)
            if run_len > 1:
                # Insert a synthetic summary marker
                compressed.append(ParsedCommit(
                    hash    = "0000000",
                    message = f"[{run_len - 1} merge commits omitted]",
                    date    = c.date,
                ))
            i = j
            continue

        # Collapse vague commit runs (≥4 consecutive)
        if c.is_vague:
            j = i
            while j < len(commits) and commits[j].is_vague and not commits[j].is_merge:
                j += 1
            run_len = j - i
            if run_len >= 4:
                compressed.append(commits[i])      # keep first
                compressed.append(ParsedCommit(
                    hash    = "0000000",
                    message = f"[{run_len - 2} similar low-signal commits omitted]",
                    date    = c.date,
                ))
                compressed.append(commits[j - 1])  # keep last
                i = j
                continue

        compressed.append(c)
        i += 1

    log.debug(
        "Compression: %d → %d commits (%.0f%% reduction)",
        len(commits), len(compressed),
        (1 - len(compressed) / len(commits)) * 100 if commits else 0,
    )
    return compressed


# ─── Truncation ───────────────────────────────────────────────────────────────

def truncate_commits(commits: list[ParsedCommit], max_count: int) -> list[ParsedCommit]:
    """
    Cap commits to max_count, keeping the most recent (git log is newest-first).
    Logs a warning if truncation occurs.
    """
    if len(commits) <= max_count:
        return commits
    log.warning(
        "Truncating %d → %d commits (MAX_COMMITS=%d)",
        len(commits), max_count, max_count,
    )
    return commits[:max_count]


# ─── Date range extraction ────────────────────────────────────────────────────

def extract_date_range(
    commits: list[ParsedCommit],
) -> Optional[tuple[str, str]]:
    """
    Return (earliest_date, latest_date) from commits that have a date.
    git log is newest-first, so latest = commits[0], earliest = commits[-1].
    Returns None if no commits carry date information.
    """
    dated = [c for c in commits if c.date]
    if not dated:
        return None
    # Newest-first → latest is first element, earliest is last
    return dated[-1].date, dated[0].date  # type: ignore[return-value]


# ─── Formatting ───────────────────────────────────────────────────────────────

def format_for_llm(commits: list[ParsedCommit], quality: QualityScore) -> str:
    """
    Render the commit list into a compact, high-signal text block for injection
    into the Gemma 4 prompt.

    Format per commit:
        <hash> <date?> <message> [+ins -del Nf]?

    Churn data is only appended when non-zero (it adds context for
    identifying high-impact commits without wasting tokens on quiet ones).
    Synthetic summary markers are passed through verbatim.
    """
    lines: list[str] = []

    for c in commits:
        if c.hash == "0000000":
            # Synthetic compression marker — pass through as-is
            lines.append(c.message)
            continue

        parts: list[str] = [c.hash[:7]]

        if c.date:
            parts.append(c.date)

        parts.append(c.message)

        # Append churn only when it's available and non-trivial
        if c.insertions > 0 or c.deletions > 0:
            churn = f"[+{c.insertions} -{c.deletions}"
            if c.files_changed:
                churn += f" {c.files_changed}f"
            churn += "]"
            parts.append(churn)

        lines.append(" ".join(parts))

    return "\n".join(lines)


def _build_metadata_header(
    total_parsed:  int,
    commit_count:  int,
    quality:       QualityScore,
    is_tiny:       bool,
    date_range:    Optional[tuple[str, str]],
) -> str:
    """
    Build a short context header prepended to the formatted log.
    This gives Gemma immediate orientation without wasting tokens on prose.
    """
    parts: list[str] = []
    parts.append(f"COMMITS_TOTAL:{total_parsed}")
    parts.append(f"COMMITS_ANALYZED:{commit_count}")
    parts.append(f"DATA_QUALITY:{quality.level.upper()}")
    parts.append(f"BUG_FIX_RATIO:{quality.bug_fix_ratio_pct}")
    parts.append(f"VAGUE_RATIO:{round(quality.vague_ratio * 100)}%")

    if date_range:
        earliest, latest = date_range
        parts.append(f"DATE_RANGE:{earliest}_to_{latest}")

    if is_tiny:
        parts.append("NOTE:MICRO_REPO_UNDER_50_COMMITS")

    if total_parsed > commit_count:
        parts.append(f"NOTE:LOG_TRUNCATED_TO_{commit_count}")

    return "# " + " | ".join(parts)


def estimate_tokens(text: str) -> int:
    """Rough token count estimate using a conservative chars-per-token ratio."""
    return max(1, round(len(text) / _CHARS_PER_TOKEN))


# ─── Public entry point ───────────────────────────────────────────────────────

def preprocess(raw_log: str, max_commits: int = MAX_COMMITS) -> tuple[str, int]:
    """
    Full preprocessing pipeline. Entry point called by main.py.

    Args:
        raw_log:     Raw git log text pasted or uploaded by the user.
        max_commits: Hard cap on commits sent to the model.

    Returns:
        (formatted_log_string, commit_count)
        where formatted_log_string is ready to inject into the Gemma prompt.

    Raises:
        ValueError: If no recognisable git commits are found in the input.
    """
    result = preprocess_full(raw_log, max_commits)
    return result.formatted_log, result.commit_count


def preprocess_full(raw_log: str, max_commits: int = MAX_COMMITS) -> PreprocessResult:
    """
    Full pipeline returning the complete PreprocessResult for callers that
    need quality scores, token estimates, or other metadata.

    Pipeline:
        parse → compress → truncate → score → date-range → format → header
    """
    # 1. Parse
    commits      = parse_commits(raw_log)          # raises ValueError if empty
    total_parsed = len(commits)

    # 2. Compress repetitive noise (reduces tokens before the hard cap)
    compressed   = compress_commits(commits)

    # 3. Hard truncation (newest-first, keep most recent)
    capped       = truncate_commits(compressed, max_commits)
    commit_count = len(capped)

    # 4. Quality scoring (on the capped set, post-compression)
    quality      = score_quality(capped)

    # 5. Date range
    date_range   = extract_date_range(capped)

    # 6. Format for LLM
    formatted    = format_for_llm(capped, quality)

    # 7. Metadata header
    is_tiny      = commit_count < TINY_REPO_THRESHOLD
    header       = _build_metadata_header(
                       total_parsed, commit_count, quality, is_tiny, date_range
                   )
    full_log     = header + "\n" + formatted

    # 8. Token estimate
    estimated_tokens = estimate_tokens(full_log)

    log.info(
        "Preprocessing complete: %d raw → %d capped commits | "
        "quality=%s | tokens≈%d | tiny=%s",
        total_parsed, commit_count, quality.level, estimated_tokens, is_tiny,
    )

    return PreprocessResult(
        formatted_log    = full_log,
        commit_count     = commit_count,
        total_parsed     = total_parsed,
        quality          = quality,
        is_tiny_repo     = is_tiny,
        estimated_tokens = estimated_tokens,
        date_range       = date_range,
        metadata_header  = header,
    )

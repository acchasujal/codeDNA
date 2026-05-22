"""
preprocessor.py — Git log parser and token optimizer for CodeDNA.

Pipeline:
  raw text  →  parse_commits()  →  slice (remove very old)
            →  compress()       →  truncate()
            →  format_for_llm() →  PreprocessResult

Aggressive performance mode features:
  - MAX_COMMITS = 180 hard limit.
  - Slices oldest commits immediately if over limit to avoid memory/token bloat.
  - Aggressive compression: drops merges and collapses vague runs of >=2 commits when overloaded.
  - Compacted metadata header with basename-only hotspots and 6-month histogram cap.
"""

from __future__ import annotations

import logging
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

# Aggressive hard limit of 180 commits for balanced detail and API reliability
MAX_COMMITS: int     = int(os.getenv("MAX_COMMITS", "180"))
TINY_REPO_THRESHOLD  = 50    # commits — triggers micro-analysis label
LOW_QUALITY_RATIO    = 0.55  # if many messages are vague/noisy -> quality=low
MED_QUALITY_RATIO    = 0.25  # if some messages are vague/noisy -> quality=medium
SHORT_MESSAGE_CHARS  = 12

# Approximate chars-per-token for Gemma tokenizer
_CHARS_PER_TOKEN     = 3.8
# Reduced from 8 to 4 to minimize token footprint
_HOTSPOT_TOP_N       = 4

# Commit messages carrying no analytical signal
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
    r"|work"
    r"|merge"
    r"|revert"
    r"|revision"
    r"|oops"
    r"|again"
    r"|more"
    r"|final"
    r"|final2"
    r"|asdf"
    r"|todo"
    r"|try"
    r"|trying"
    r"|debug"
    r"|save"
    r"|checkpoint"
    r"|commit"
    r"|."          # single char
    r"|[0-9]+"     # pure numbers
    r")\s*\.?$",
    re.IGNORECASE,
)

_MESSY_WORD_PATTERN: re.Pattern[str] = re.compile(
    r"\b("
    r"wip|tmp|temp|misc|stuff|changes?|updates?|fix(es|ed)?|bug|oops|again|todo"
    r"|updte|udpate|updat|chnage|chagnes|fi[xs]|fxi|fux|wrok|teh|adn"
    r")\b",
    re.IGNORECASE,
)

_BUG_FIX_PATTERN: re.Pattern[str] = re.compile(
    r"\b(fix|fixes|fixed|bug|hotfix|patch|revert|regression|broken|crash|error|exception)\b",
    re.IGNORECASE,
)

_MERGE_PATTERN: re.Pattern[str] = re.compile(
    r"^merge\s+(branch|pull\s+request|remote|tag)",
    re.IGNORECASE,
)

# ─── Commit line parsers ──────────────────────────────────────────────────────

_ONELINE_RE: re.Pattern[str] = re.compile(
    r"^([0-9a-f]{5,40})"          # group 1: hash
    r"(?:\s+\(.*?\))?"            # optional: ref decorations
    r"\s+(.*?)$",                  # group 2: remainder
    re.IGNORECASE,
)

_LOOSE_HASH_RE: re.Pattern[str] = re.compile(
    r"^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?"
    r"([0-9a-f]{5,40})\b"
    r"(?:\s+|[:|-]+\s*)"
    r"(.+?)\s*$",
    re.IGNORECASE,
)

_DATE_RE: re.Pattern[str] = re.compile(
    r"\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b"
)

_STAT_SUMMARY_RE: re.Pattern[str] = re.compile(
    r"^\s*\d+\s+files?\s+changed",
    re.IGNORECASE,
)

_STAT_FILE_RE: re.Pattern[str] = re.compile(
    r"^\s*([\w/.\-\\{}()\[\] ]+?)\s*\|\s*(\d+)",
)

_NUMSTAT_RE: re.Pattern[str] = re.compile(
    r"^\s*(\d+|-)\s+(\d+|-)\s+(.+)$"
)

_BLANK_RE: re.Pattern[str] = re.compile(r"^\s*$")


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass(slots=True)
class ParsedCommit:
    """One commit extracted from the raw log."""
    hash:          str
    message:       str
    date:          Optional[str]  = None   # "YYYY-MM-DD" if extractable
    insertions:    int            = 0
    deletions:     int            = 0
    files_changed: int            = 0
    files:         list[str]      = field(default_factory=list)  # filenames from --stat
    is_merge:      bool           = False
    is_vague:      bool           = False
    is_bug_fix:    bool           = False


@dataclass
class QualityScore:
    """Commit message quality assessment for the entire log."""
    level:         str   = "high"
    vague_count:   int   = 0
    total_count:   int   = 0
    vague_ratio:   float = 0.0
    bug_fix_count: int   = 0
    short_count:   int   = 0
    short_ratio:   float = 0.0
    missing_dates: int   = 0
    missing_files: int   = 0
    warning:       str   = ""

    @property
    def bug_fix_ratio_pct(self) -> str:
        if self.total_count == 0:
            return "0%"
        return f"{round(self.bug_fix_count / self.total_count * 100)}%"


@dataclass
class PreprocessResult:
    """Processed result returned to main.py."""
    formatted_log:    str            # compact text ready to inject into prompt
    commit_count:     int            # how many commits reached the model
    total_parsed:     int            # how many were in the raw log before capping
    quality:          QualityScore
    is_tiny_repo:     bool           # True if commit_count < TINY_REPO_THRESHOLD
    estimated_tokens: int            # rough estimate for logging/cost awareness
    date_range:       Optional[tuple[str, str]] = None  # (earliest, latest) YYYY-MM-DD
    metadata_header:  str            = field(default="")
    file_hotspots:    list[tuple[str, int]] = field(default_factory=list)   # [(path, count)]
    monthly_histogram: dict[str, int] = field(default_factory=dict)         # {YYYY-MM: count}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_vague(message: str) -> bool:
    """Return True if the commit message carries no analytical signal."""
    msg = _normalize_message(message)
    if len(msg) < 4:
        return True
    if _VAGUE_PATTERNS.match(msg):
        return True
    words = re.findall(r"[a-zA-Z]+", msg)
    return len(words) <= 2 and bool(_MESSY_WORD_PATTERN.search(msg))


def _normalize_message(message: str) -> str:
    """Normalize noisy commit-message wrappers without inventing signal."""
    msg = message.strip()
    msg = re.sub(r"^\[[^\]]+\]\s*", "", msg)
    msg = re.sub(
        r"^(feat|fix|docs|style|refactor|test|chore|build|ci)(\([^)]+\))?:\s*",
        r"\1: ",
        msg,
        flags=re.IGNORECASE,
    )
    msg = re.sub(r"\s+", " ", msg)
    msg = msg.strip(" -:\t")
    return msg or "empty message"


_MONTH_MAP: dict[str, str] = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
}


def _parse_any_date(text: str) -> Optional[str]:
    """Extract and normalize a date string from any common git log format."""
    iso_m = _DATE_RE.search(text)
    if iso_m:
        return iso_m.group(1)
    m = re.search(
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+(\d{4})",
        text, re.IGNORECASE,
    )
    if m:
        month_str, day_str, year_str = m.group(1), m.group(2), m.group(3)
        day_str = f"0{day_str}" if len(day_str) == 1 else day_str
        month_num = _MONTH_MAP.get(month_str.capitalize()[:3], "01")
        return f"{year_str}-{month_num}-{day_str}"
    return None


def _extract_stat_churn(
    lines: list[str], start_idx: int
) -> tuple[int, int, int, list[str]]:
    """Scan lines immediately after a commit line for --stat churn data."""
    insertions = deletions = files_changed = 0
    filenames: list[str] = []
    i = start_idx

    while i < len(lines):
        line = lines[i]

        if _STAT_SUMMARY_RE.match(line):
            ins_m = re.search(r"(\d+)\s+insertion", line)
            del_m = re.search(r"(\d+)\s+deletion",  line)
            fch_m = re.search(r"(\d+)\s+files?\s+changed", line)
            if ins_m: insertions    = int(ins_m.group(1))
            if del_m: deletions     = int(del_m.group(1))
            if fch_m: files_changed = int(fch_m.group(1))
            break

        sf = _STAT_FILE_RE.match(line)
        if sf:
            fname = sf.group(1).strip()
            if fname and not fname.startswith("{") and len(fname) < 200:
                filenames.append(fname)
            i += 1
            continue

        ns = _NUMSTAT_RE.match(line)
        if ns:
            ins_s, del_s, fpath = ns.group(1), ns.group(2), ns.group(3).strip()
            if ins_s != "-": insertions    += int(ins_s)
            if del_s != "-": deletions     += int(del_s)
            files_changed += 1
            if fpath and len(fpath) < 200:
                filenames.append(fpath)
            i += 1
            continue

        if _BLANK_RE.match(line):
            i += 1
            continue

        break

    return insertions, deletions, files_changed, filenames


# ─── Parsing ──────────────────────────────────────────────────────────────────

def parse_commits(raw_log: str) -> list[ParsedCommit]:
    """Parse a raw git log string into a list of ParsedCommit objects."""
    lines = raw_log.splitlines()
    commits: list[ParsedCommit] = []

    has_full_commit_lines = any(
        re.match(r"^commit\s+[0-9a-f]{5,40}", line.strip(), re.IGNORECASE)
        for line in lines
    )

    if has_full_commit_lines:
        i = 0
        current_commit: Optional[ParsedCommit] = None
        message_lines: list[str] = []

        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            commit_match = re.match(r"^commit\s+([0-9a-f]{5,40})", stripped, re.IGNORECASE)
            if commit_match:
                if current_commit:
                    if message_lines:
                        current_commit.message = _normalize_message(message_lines[0])
                    current_commit.is_merge   = bool(_MERGE_PATTERN.match(current_commit.message))
                    current_commit.is_vague   = _is_vague(current_commit.message)
                    current_commit.is_bug_fix = bool(_BUG_FIX_PATTERN.search(current_commit.message))
                    commits.append(current_commit)

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

                if (
                    _STAT_SUMMARY_RE.match(stripped)
                    or _STAT_FILE_RE.match(stripped)
                    or _NUMSTAT_RE.match(stripped)
                ):
                    ins, dels, files, fnames = _extract_stat_churn(lines, i)
                    current_commit.insertions    = ins
                    current_commit.deletions     = dels
                    current_commit.files_changed = files
                    current_commit.files.extend(fnames)
                    while i < len(lines):
                        nxt = lines[i].strip()
                        if (
                            _STAT_SUMMARY_RE.match(nxt)
                            or _STAT_FILE_RE.match(nxt)
                            or _NUMSTAT_RE.match(nxt)
                            or not nxt
                        ):
                            i += 1
                        else:
                            break
                    continue

                if stripped:
                    message_lines.append(stripped)

            i += 1

        if current_commit:
            if message_lines:
                current_commit.message = _normalize_message(message_lines[0])
            current_commit.is_merge   = bool(_MERGE_PATTERN.match(current_commit.message))
            current_commit.is_vague   = _is_vague(current_commit.message)
            current_commit.is_bug_fix = bool(_BUG_FIX_PATTERN.search(current_commit.message))
            commits.append(current_commit)

    else:
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            if (
                not stripped
                or _BLANK_RE.match(stripped)
                or _STAT_SUMMARY_RE.match(stripped)
                or _STAT_FILE_RE.match(stripped)
                or _NUMSTAT_RE.match(stripped)
            ):
                i += 1
                continue

            m = _ONELINE_RE.match(stripped) or _LOOSE_HASH_RE.match(stripped)
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

            message = _normalize_message(re.sub(r"^\(.*?\)\s*", "", message))
            ins, dels, files, fnames = _extract_stat_churn(lines, i + 1)

            commits.append(ParsedCommit(
                hash          = commit_hash,
                message       = message,
                date          = date,
                insertions    = ins,
                deletions     = dels,
                files_changed = files,
                files         = fnames,
                is_merge      = bool(_MERGE_PATTERN.match(message)),
                is_vague      = _is_vague(message),
                is_bug_fix    = bool(_BUG_FIX_PATTERN.search(message)),
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
    """Assess the quality of the commit messages, excluding merges."""
    non_merge = [c for c in commits if not c.is_merge]
    total     = len(non_merge)

    if total == 0:
        return QualityScore(level="low", total_count=0)

    vague_count   = sum(1 for c in non_merge if c.is_vague)
    short_count   = sum(1 for c in non_merge if len(c.message.strip()) <= SHORT_MESSAGE_CHARS)
    missing_dates = sum(1 for c in non_merge if not c.date)
    missing_files = sum(1 for c in non_merge if c.files_changed == 0 and not c.files)
    bug_fix_count = sum(1 for c in non_merge if c.is_bug_fix)
    vague_ratio   = vague_count / total
    short_ratio   = short_count / total
    missing_date_ratio = missing_dates / total
    missing_file_ratio = missing_files / total

    level = (
        "low"    if (
            vague_ratio >= LOW_QUALITY_RATIO
            or (vague_ratio >= 0.40 and short_ratio >= 0.45)
            or (missing_date_ratio >= 0.80 and missing_file_ratio >= 0.80)
        ) else
        "medium" if (
            vague_ratio >= MED_QUALITY_RATIO
            or short_ratio >= 0.35
            or missing_date_ratio >= 0.60
            or missing_file_ratio >= 0.70
        ) else
        "high"
    )

    warning = ""
    if level == "low":
        warning = (
            "LOW_INPUT_QUALITY: many commit messages are vague, very short, "
            "or missing dates/file stats. Use conservative low-confidence "
            "milestones and cite only observable hashes, counts, dates, and files."
        )
    elif level == "medium":
        warning = (
            "MEDIUM_INPUT_QUALITY: some commit messages are vague or lack dates/file stats. "
            "Avoid strong claims without direct evidence."
        )

    return QualityScore(
        level         = level,
        vague_count   = vague_count,
        total_count   = total,
        vague_ratio   = vague_ratio,
        bug_fix_count = bug_fix_count,
        short_count   = short_count,
        short_ratio   = short_ratio,
        missing_dates = missing_dates,
        missing_files = missing_files,
        warning       = warning,
    )


# ─── Monthly histogram ────────────────────────────────────────────────────────

def build_monthly_histogram(commits: list[ParsedCommit]) -> dict[str, int]:
    """Count commits per month YYYY-MM, sorted chronologically."""
    monthly: Counter[str] = Counter()
    for c in commits:
        if c.date:
            monthly[c.date[:7]] += 1
    return dict(sorted(monthly.items()))


# ─── File hotspots ────────────────────────────────────────────────────────────

def extract_file_hotspots(
    commits: list[ParsedCommit], top_n: int = _HOTSPOT_TOP_N
) -> list[tuple[str, int]]:
    """Aggregate file change frequencies and return top N hotspots."""
    counts: Counter[str] = Counter()
    for c in commits:
        for f in set(c.files):
            fname = f.lstrip("./").strip()
            if fname and not fname.endswith((".png", ".jpg", ".gif", ".ico", ".woff", ".svg", ".md")):
                counts[fname] += 1
    return counts.most_common(top_n)


# ─── Compression ──────────────────────────────────────────────────────────────

def compress_commits(commits: list[ParsedCommit], limit_active: bool = False) -> list[ParsedCommit]:
    """
    Reduce tokens by aggressively collapsing runs of vague and merge commits.
    
    If limit_active is True, compresses even more aggressively:
      - Drops merge commits entirely to save space.
      - Collapses vague runs of 2+ (normally 4+).
    """
    if len(commits) <= 8:
        return commits

    compressed: list[ParsedCommit] = []
    i = 0
    vague_run_threshold = 2 if limit_active else 4

    while i < len(commits):
        c = commits[i]

        if c.is_merge:
            if limit_active:
                # Discard merge commits entirely under extreme limits to save tokens
                i += 1
                continue
            j = i
            while j < len(commits) and commits[j].is_merge:
                j += 1
            run_len = j - i
            compressed.append(c)
            if run_len > 1:
                compressed.append(ParsedCommit(
                    hash    = "0000000",
                    message = f"[{run_len - 1} merges omitted]",
                    date    = c.date,
                ))
            i = j
            continue

        if c.is_vague:
            j = i
            while j < len(commits) and commits[j].is_vague and not commits[j].is_merge:
                j += 1
            run_len = j - i
            if run_len >= vague_run_threshold:
                compressed.append(commits[i])
                compressed.append(ParsedCommit(
                    hash    = "0000000",
                    message = f"[{run_len - 1} vague commits omitted]",
                    date    = c.date,
                ))
                i = j
                continue

        compressed.append(c)
        i += 1

    return compressed


# ─── Truncation ───────────────────────────────────────────────────────────────

def truncate_commits(commits: list[ParsedCommit], max_count: int) -> list[ParsedCommit]:
    """Cap commits to max_count, keeping the newest ones."""
    if len(commits) <= max_count:
        return commits
    return commits[:max_count]


# ─── Date range ───────────────────────────────────────────────────────────────

def extract_date_range(commits: list[ParsedCommit]) -> Optional[tuple[str, str]]:
    """Return earliest and latest commit dates (YYYY-MM-DD)."""
    dated = [c for c in commits if c.date]
    if not dated:
        return None
    return dated[-1].date, dated[0].date   # (earliest, latest)


# ─── Formatting ───────────────────────────────────────────────────────────────

def format_for_llm(commits: list[ParsedCommit], quality: QualityScore) -> str:
    """Format commits into a hyper-compact layout: hash date msg [+ins -del Nf]"""
    lines: list[str] = []

    for c in commits:
        if c.hash == "0000000":
            lines.append(c.message)
            continue

        parts: list[str] = [c.hash[:7]]
        if c.date:
            parts.append(c.date)
        parts.append(c.message)

        if c.insertions > 0 or c.deletions > 0:
            churn = f"[+{c.insertions} -{c.deletions}"
            if c.files_changed:
                churn += f" {c.files_changed}f"
            churn += "]"
            parts.append(churn)

        lines.append(" ".join(parts))

    return "\n".join(lines)


# ─── Reduced Metadata Header ──────────────────────────────────────────────────

def _build_metadata_header(
    total_parsed:      int,
    commit_count:      int,
    quality:           QualityScore,
    is_tiny:           bool,
    date_range:        Optional[tuple[str, str]],
    monthly_histogram: dict[str, int],
    file_hotspots:     list[tuple[str, int]],
) -> str:
    """
    Produces an ultra-condensed header to save hundreds of input tokens.
    Uses short tags, filters older months, and prints only file basenames.
    """
    lines: list[str] = []

    earliest, latest = date_range if date_range else ("?", "?")
    
    # Line 1: Basic stats combined into one line
    hdr = (
        f"# META: {total_parsed}tot | {commit_count}ana | Q:{quality.level.upper()} "
        f"| Fx:{quality.bug_fix_ratio_pct} | Vg:{round(quality.vague_ratio * 100)}% "
        f"| Short:{round(quality.short_ratio * 100)}% | NoDate:{quality.missing_dates} "
        f"| NoFiles:{quality.missing_files} | Dates:{earliest}..{latest}"
    )
    if is_tiny:
        hdr += " | TINY"
    if total_parsed > commit_count:
        hdr += f" | TRUNC:{commit_count}"
    lines.append(hdr)

    if quality.warning:
        lines.append(f"# QUALITY_WARNING: {quality.warning}")

    # Line 2: Condensed chronological monthly counts (last 6 months only to save tokens)
    if monthly_histogram:
        last_months = list(monthly_histogram.items())[-6:]
        hist_pairs = ",".join(f"{m}:{n}" for m, n in last_months)
        lines.append(f"# MONTHS:{hist_pairs}")

    # Line 3: Basename-only file hotspots (saves massive token space over full paths)
    if file_hotspots:
        spots = ",".join(f"{os.path.basename(f)}:{n}" for f, n in file_hotspots[:_HOTSPOT_TOP_N])
        lines.append(f"# HOTSPOTS:{spots}")

    return "\n".join(lines)


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / _CHARS_PER_TOKEN))


# ─── Public entry points ──────────────────────────────────────────────────────

def preprocess(raw_log: str, max_commits: int = MAX_COMMITS) -> tuple[str, int]:
    result = preprocess_full(raw_log, max_commits)
    return result.formatted_log, result.commit_count


def preprocess_full(raw_log: str, max_commits: int = MAX_COMMITS) -> PreprocessResult:
    """
    Main preprocessing pipeline.
    
    Aggressive Optimization:
      If raw_log size suggests more than max_commits, we aggressively slice the parsed 
      array *before* performing heavy calculations, compression, or LLM formatting.
    """
    # 1. Parse
    commits = parse_commits(raw_log)
    total_parsed = len(commits)

    # 2. Aggressive Performance Fix: slice oldest commits before compressing/filtering
    limit_active = total_parsed > max_commits
    if limit_active:
        commits = commits[:max_commits]  # Keep newest commits, discard older ones

    # 3. Compress repetitive noise
    compressed = compress_commits(commits, limit_active=limit_active)

    # 4. Hard truncation cap
    capped = truncate_commits(compressed, max_commits)
    commit_count = len(capped)

    # 5. Quality scoring (on capped set)
    quality = score_quality(capped)

    # 6. Date range
    date_range = extract_date_range(capped)

    # 7. Monthly histogram (capped internally to last 6 months in header)
    monthly_hist = build_monthly_histogram(capped)

    # 8. File hotspots (fewer, basename-only in header)
    hotspots = extract_file_hotspots(capped)

    # 9. Format
    formatted = format_for_llm(capped, quality)

    # 10. Low-verbosity metadata header
    is_tiny = commit_count < TINY_REPO_THRESHOLD
    header = _build_metadata_header(
        total_parsed, commit_count, quality, is_tiny,
        date_range, monthly_hist, hotspots,
    )
    full_log = header + "\n" + formatted

    # Token estimate
    estimated_tokens = estimate_tokens(full_log)

    log.info(
        "Preprocessor: %d raw -> %d capped | Q=%s | Tokens~%d | limit_active=%s",
        total_parsed, commit_count, quality.level, estimated_tokens, limit_active
    )

    return PreprocessResult(
        formatted_log     = full_log,
        commit_count      = commit_count,
        total_parsed      = total_parsed,
        quality           = quality,
        is_tiny_repo      = is_tiny,
        estimated_tokens  = estimated_tokens,
        date_range        = date_range,
        metadata_header   = header,
        file_hotspots     = hotspots,
        monthly_histogram = monthly_hist,
    )

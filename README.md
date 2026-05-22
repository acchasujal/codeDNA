# CodeDNA — AI Codebase Archaeologist

> Feed Gemma 4 your git history. Discover exactly when — and why — your codebase evolved.

![CodeDNA Demo](./demo.gif)

Every codebase has a turning point. The moment before is clean commits and clear intent.
The moment after is hotfixes, reverts, and growing entropy. **CodeDNA finds it.**

---

## What It Does

- **Maps your codebase history with Gemma 4** — up to 400 commits, preprocessed and compressed for maximum analytical signal. The preprocessor extracts monthly commit histograms and per-file change frequency before sending to the model, so insights are grounded in observable data.

- **Returns a structured archaeological report** — health score with transparent breakdown, milestone timeline (bug storms, refactors, pivots, feature bursts), and key metrics. Every claim cites a specific commit hash, date, or metadata value.

- **Streams Gemma 4's live reasoning** — watch the Thinking Mode trace in real-time as the model identifies causal patterns across years of history. Verifiable: the stream shows exactly what Gemma 4 is thinking.

---

## Why Gemma 4

**1. Causal reasoning via Thinking Mode — not just summarization.**
Gemma 4's Thinking Mode traces *why* patterns emerged: connecting a breaking API change
to its downstream fix cascade weeks later. The reasoning stream is visible and verifiable.
Standard LLMs describe history. Gemma 4 reasons through it.

**2. 128K context — the archaeology window.**
400 commits × ~200 tokens = ~80K tokens of compressed history in a single request.
No chunking, no multi-call stitching, no context loss between fragments.
The model holds the full narrative arc at once — which is the only way to detect
multi-month causal patterns like: *pivot in October → bug storm in March.*

**3. Privacy-first by design.**
Your git history contains proprietary logic, security patches, unreleased feature names,
and competitive intelligence. CodeDNA uses your API key — your data is never retained
or used for model training. This is the only architecture engineering teams will trust.

**4. Structured output maps directly to UI.**
Gemma 4 returns a typed JSON object that Pydantic v2 validates against a strict schema
before it touches the frontend. If the model output doesn't validate, you get a clean
error — no silent hallucinations, no broken UI states.

---

## Quick Start

```bash
git clone https://github.com/acchasujal/codedna.git

# Backend
cd codedna/backend
pip install -r requirements.txt
cp .env.example .env          # Add your Google AI Studio key as GEMINI_API_KEY
uvicorn main:app --reload     # http://localhost:8000

# Frontend (new terminal)
cd ../frontend
npm install
npm run dev                   # http://localhost:5173
```

### Get a Google AI Studio API Key
1. Visit [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key** → **Create API key**
3. Paste into `backend/.env` as `GEMINI_API_KEY=your_key_here`

---

## Get Your Git Log

```bash
# Any local repo:
git log --stat | head -3000 > history.txt
# Paste contents into CodeDNA, or use the Upload .txt button.

# The React 16.8 demo log (what the GIF uses):
git clone https://github.com/facebook/react
cd react
git log --stat --after="2018-01-01" --before="2019-06-01" | head -3000 > react_hooks_era.txt
```

---

## Architecture

```
git log text
    ↓
preprocessor.py
  ├── parse_commits()          — supports all git log formats
  ├── compress_commits()       — collapse merge/vague noise
  ├── build_monthly_histogram() — ground-truth velocity data
  ├── extract_file_hotspots()  — top changed files across history
  └── format_for_llm()         — compact metadata header + commit list
    ↓
Gemma 4 API (gemma-2.0-flash-thinking-exp via Google AI Studio)
    ↓ (started in parallel)
POST /analyze              →  full structured JSON (Pydantic-validated)
POST /analyze/stream       →  SSE token stream (live Thinking Mode trace)
    ↓
React UI
  ├── HealthScore.tsx    — SVG ring + transparent score breakdown table
  ├── Timeline.tsx       — chronological milestone cards, color-coded by type
  └── ReasoningPanel.tsx — live token stream, fetch+ReadableStream POST
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✓ | — | Google AI Studio API key |
| `GEMMA_MODEL` | | `gemma-2.0-flash-thinking-exp` | Model ID |
| `MAX_COMMITS` | | `400` | Commit cap per analysis |
| `REQUEST_TIMEOUT` | | `120` | Gemma API timeout (seconds) |
| `PORT` | | `8000` | FastAPI listen port |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| AI Model | Gemma 4 via Google AI Studio |
| Backend | FastAPI + Pydantic v2 + httpx |
| Streaming | SSE via FastAPI StreamingResponse (POST) |
| Frontend | React 19 + Vite 8 + TypeScript |
| Styling | Tailwind CSS v4 |
| Preprocessing | Pure Python stdlib — no external NLP deps |

---

## Judging Notes (Google Gemma 4 Challenge)

This project was built for the [Google Gemma 4 Challenge](https://dev.to/challenges/gemma) — May 2026.

Key technical decisions:
- **Single-model inference**: One Gemma 4 call per analysis (not a chain). The preprocessing pipeline does the heavy lifting deterministically, so the model focuses on reasoning, not counting.
- **Preprocessing cache**: Both `/analyze` and `/analyze/stream` share a cached preprocessing result — no double API calls, no double latency.
- **Anti-hallucination by construction**: The prompt injects ground-truth statistics (monthly histogram, file hotspots, bug fix ratios) from the preprocessor. Gemma references these numbers rather than inventing them.
- **Verifiable outputs**: Every milestone description cites a specific commit hash, date, or metadata metric. Users can verify any claim against their raw git log.

---

*Solo project. Built in 4 days.*
*All commits in this repo are real.*
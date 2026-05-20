# CodeDNA — Complete Build Package
> AI Codebase Archaeologist | Google Gemma 4 Challenge

---

## ⚠️ READ THIS FIRST

You have 4 days. Every doc below is designed to be pasted directly into Claude Sonnet 4.6 as context. Don't re-read these. Use them.

**Your only job after reading this:** Get the Google AI Studio API key and run a test prompt tonight.

---

## 1. PROJECT SUMMARY (One-Pager)

**Name:** CodeDNA  
**Subtitle:** AI Codebase Archaeologist  
**Tagline:** "Feed Gemma 4 your git history. Discover exactly when — and why — your codebase started falling apart."

**What it does:**  
Developer pastes git log → Gemma 4 (Thinking Mode) reconstructs the codebase's story → animated timeline with bug storms, pivots, refactor eras → live reasoning sidebar → exportable Markdown report.

**Why it wins:**
- Output is 100% verifiable (judge checks against real commits)
- Strong emotional hook (every dev has a codebase they're ashamed of)
- Live Thinking Mode = visible, intentional Gemma 4 use
- Underserved niche in current entries (no strong narrative timeline exists yet)
- Works reliably without powerful hardware (API-first)

**Tracks:** Build With Gemma 4 + Write About Gemma 4  
**Solo build:** Yes  
**Target:** Top 5 in Build, Top 3 in Write

---

## 2. PRD — PRODUCT REQUIREMENTS DOCUMENT

### Problem Statement
Developers inherit codebases, work on them for years, and have no intuitive way to understand *when* things degraded, *why* certain periods were chaotic, or *what decisions* caused current technical debt. Git history contains all this — but nobody reads 2000 commits manually.

### Solution
CodeDNA uses Gemma 4's Thinking Mode + 128K context to process a codebase's commit history and return a structured, human-readable narrative: milestones, bug storms, refactor eras, and an overall health score — with live reasoning visible to the user.

### Users
- Developers inheriting legacy codebases
- Engineering managers reviewing team history
- Solo developers auditing their own old projects
- (For demo: judges reviewing the React public repo)

### Core User Flow
```
1. User pastes git log --oneline --stat OR uploads .txt file
2. Clicks "Analyze with Gemma 4"
3. Sees live Thinking Mode tokens streaming in right panel
4. Timeline builds itself left panel (animated, color-coded)
5. Health score + key metrics appear top center
6. User can export Markdown summary
```

### MVP Features (MUST ship)
| Feature | Priority | Notes |
|---|---|---|
| Git log paste input | P0 | Also accept .txt file upload |
| Auto-preprocessing | P0 | Cap at 400 commits, clean format |
| Gemma 4 API call | P0 | Via Google AI Studio |
| Structured JSON output | P0 | Milestone, type, severity, commits |
| Animated vertical timeline | P0 | Color: red=bug, yellow=refactor, green=pivot |
| Live Thinking Mode sidebar | P0 | SSE streaming |
| Health score display | P0 | 0–100, prominent |
| Small repo fallback | P1 | Graceful message if <50 commits |
| Markdown export | P1 | One button |

### Cut Completely (Do Not Build)
- GitHub OAuth / GitHub API integration
- Full diff analysis
- Multi-repo comparison
- Neo4j or any database
- Force-directed graph
- Branch visualization
- User accounts
- Deployment (local run is fine for demo)

### Success Criteria for Submission
- [ ] Works reliably on React public repo (the demo target)
- [ ] GIF is 12–15 seconds, shows all 3 panels
- [ ] "Why Gemma 4" argument is airtight in README
- [ ] Article is publishable on DEV.to with emotional hook
- [ ] No broken states or crashes during demo

---

## 3. TECHNICAL SPEC

### Stack
```
Backend:   FastAPI (Python 3.11+)
Frontend:  React 18 + Vite + Tailwind CSS
LLM:       Google Gemma 4 via AI Studio API (gemma-4-thinking or gemma-4-it)
Streaming: SSE (Server-Sent Events) for Thinking Mode
State:     In-memory only (no DB)
```

### Folder Structure
```
codedna/
├── backend/
│   ├── main.py           # FastAPI app + endpoints
│   ├── preprocessor.py   # Git log cleaning + chunking
│   ├── prompt.py         # Master system prompt
│   ├── models.py         # Pydantic schemas
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── InputPanel.tsx      # Paste box + upload
│   │   │   ├── Timeline.tsx        # Animated vertical timeline
│   │   │   ├── ReasoningPanel.tsx  # SSE streaming sidebar
│   │   │   ├── HealthScore.tsx     # Big score display
│   │   │   └── ExportButton.tsx
│   │   └── api/
│   │       └── analyze.ts          # API calls
│   ├── package.json
│   └── vite.config.ts
├── README.md
└── .env.example
```

### API Endpoints
```
POST /analyze          # Accepts git log text, returns JSON analysis
GET  /analyze/stream   # SSE endpoint for Thinking Mode tokens
GET  /health           # Basic health check
```

### Data Flow
```
User Input (git log text)
    ↓
preprocessor.py
  - Strip header noise
  - Parse commit: hash | date | message
  - Cap at last 400 commits
  - If >400: summarize oldest chunks
    ↓
FastAPI POST /analyze
    ↓
Gemma 4 API (structured JSON prompt)
    ↓
Parse + validate JSON response (Pydantic)
    ↓
Return to frontend
    ↓ (parallel)
SSE stream of thinking tokens → ReasoningPanel
```

### Environment Variables
```
GEMINI_API_KEY=your_google_ai_studio_key
GEMMA_MODEL=gemma-2.0-flash-thinking-exp  # or latest available
MAX_COMMITS=400
PORT=8000
```

### Commit Color Coding
```
bug_storm    → red     (#EF4444)
refactor     → yellow  (#F59E0B)  
pivot        → green   (#10B981)
feature_burst→ blue    (#3B82F6)
stability    → gray    (#6B7280)
```

---

## 4. MASTER SYSTEM PROMPT FOR GEMMA 4

```
You are CodeDNA, an expert codebase archaeologist powered by Gemma 4 Thinking Mode.

Your task: Analyze the git commit history below and reconstruct the true story of this codebase.

STRICT RULES:
1. Every claim must be tied to specific commits, dates, or observable patterns in the data.
2. NEVER use vague language like "technical debt accumulated" without pointing to specific commit evidence.
3. If commit messages are too vague (e.g., "fix", "update", "wip"), say so explicitly — do not invent meaning.
4. For small repos (<50 commits), produce a micro-analysis and label it as such.
5. Health score must be justified with at least 2 concrete reasons from the data.
6. If you cannot determine something with confidence, output "insufficient_data" for that field.

Output ONLY this exact JSON — no explanation before or after, no markdown fences:

{
  "metadata": {
    "commits_analyzed": <integer>,
    "time_span_days": <integer>,
    "time_span_readable": "<e.g. 2 years 4 months>",
    "health_score": <integer 0-100>,
    "health_justification": "<2 sentences with commit evidence>"
  },
  "summary": "<3-4 sentence narrative of the codebase's life story, factual>",
  "milestones": [
    {
      "id": "<unique string>",
      "period": "<YYYY-MM or YYYY-MM to YYYY-MM>",
      "type": "<bug_storm | refactor | pivot | feature_burst | stability>",
      "title": "<Short title, max 6 words>",
      "description": "<2-3 sentences with specific commit references or patterns>",
      "severity": "<high | medium | low>",
      "commit_hashes": ["<hash1>", "<hash2>"]
    }
  ],
  "metrics": {
    "most_chaotic_period": "<YYYY-MM>",
    "most_stable_period": "<YYYY-MM>",
    "biggest_pivot_commit": "<hash or null>",
    "bug_fix_ratio": "<percentage of commits containing fix/bug/hotfix keywords>"
  },
  "churn_summary": "<One sentence, factual, referencing specific date range>",
  "data_quality": "<high | medium | low — based on commit message quality>"
}

GIT HISTORY:
{{GIT_LOG}}
```

---

## 5. AGENTS.MD — Instructions for AI Coding Partners

```markdown
# CodeDNA — AI Coding Partner Instructions

## Project Context
Building CodeDNA: An AI codebase archaeologist using Gemma 4 (Google AI Studio API).
Stack: FastAPI backend, React+Vite+Tailwind frontend.
Solo build, 4-day timeline.
Target: Google Gemma 4 Challenge (dev.to).

## Key Constraints
- NO database. In-memory only.
- NO GitHub API. User pastes git log manually.
- NO complex libs. Keep deps minimal.
- API-first (Google AI Studio), no local Ollama required.
- SSE streaming for Thinking Mode output.
- Must work on weak hardware (laptop dev environment).

## Code Quality Rules
- Always use Pydantic v2 for models.
- Always include error handling for API failures.
- Always validate git log input before sending to API.
- Use TypeScript for all frontend files.
- Tailwind only — no custom CSS files except for animations.
- Never use any form tags in React — use onClick handlers.

## When I ask for code, always:
1. Give complete, runnable files — not snippets.
2. Include all imports.
3. Add inline comments for non-obvious logic.
4. Handle edge cases: empty input, API timeout, malformed JSON response.
5. Make it production-quality, not prototype-quality.

## Project Files Reference
- Master system prompt: /backend/prompt.py
- Data schemas: /backend/models.py  
- Main API: /backend/main.py
- Timeline component: /frontend/src/components/Timeline.tsx
- Reasoning panel: /frontend/src/components/ReasoningPanel.tsx

## Demo Target
The demo runs on the public React GitHub repo git log.
All features must work correctly on that specific input.
```

---

## 6. DEMO & GIF SCRIPT

### Demo Repo
Use React's public GitHub repo. Get the log:
```bash
git clone https://github.com/facebook/react.git
cd react
git log --oneline --stat --since="2017-01-01" | head -2000 > react_history.txt
```

### GIF Script (12–15 seconds, record at 1.5x speed)
```
0:00–0:02  → Paste the React git log into the input box. Big text scrolling in.
0:02–0:04  → Click "Analyze with Gemma 4". Loading spinner appears.
0:04–0:07  → Right panel: Thinking Mode tokens start streaming (green text, terminal style).
0:07–0:10  → Center: Timeline builds itself. First green milestone appears (early days).
             Then yellow (refactor). Then a DRAMATIC RED cluster: "Bug Storm: 2019".
0:10–0:12  → Health score counter animates up to final number. Metrics appear.
0:12–0:15  → Wide shot of all 3 panels working simultaneously.
```

### The Thumbnail Moment (Stop-scroll frame)
The red "Bug Storm" cluster appearing on the timeline at 0:08–0:09. Make it large, bold, slightly animated (pulse effect). This single frame will get the most attention on DEV.to.

---

## 7. WRITE TRACK — ARTICLE OUTLINE

**Title:** "I Fed 10 Years of React's Git History to Gemma 4. It Found Exactly When Things Got Messy."

**Why this title works:** Personal, specific, verifiable, slightly alarming. Uses a real famous repo (instant credibility).

### Article Structure

**Hook (150 words):**  
Start with a story: "Every codebase has a turning point. The moment before is clean commits and clear intent. The moment after is hotfixes, reverts, and growing entropy. The problem is — nobody ever marks that moment. Until now."

**Section 1 — The Problem (200 words):**  
Git history is the most underused developer tool. 10 years of decisions locked in commit messages nobody reads. What patterns live in there?

**Section 2 — Why Gemma 4 Specifically (300 words):**  
- Thinking Mode: Causal chain reasoning across 400+ commits ("Commit A destabilized module X, causing 12 hotfixes in the next 30 days")
- 128K context: No chunking tricks needed for full meaningful history
- Local-first option: You wouldn't pipe proprietary git history to a cloud API
- Structured output: Drives the UI directly without post-processing

**Section 3 — Building It (400 words):**  
Show the architecture. Show the system prompt. Show one raw JSON output sample. Keep it concrete.

**Section 4 — What It Found in React's History (400 words):**  
This is the viral section. Show the actual output. Let readers argue about whether it's accurate. Controversy = comments = reactions.

**Section 5 — Try It Yourself (100 words):**  
GitHub link. One-command setup. Call to action: "What would CodeDNA find in your repo?"

**Reaction Driver (end of article):**  
Post the actual Gemma 4 output for 2019 React history with the question: "Is this accurate? What does yours show?" First 10 commenters get most of the engagement.

---

## 8. GITHUB README STRUCTURE

```markdown
# CodeDNA — AI Codebase Archaeologist

> Feed Gemma 4 your git history. Discover exactly when and why your codebase evolved — or started falling apart.

[GIF here — autoplays, 12 seconds, shows all 3 panels]

## What It Does
[3 bullet points, concrete]

## Why Gemma 4
[4 bullet points: Thinking Mode, 128K, local-first, structured output]

## Quick Start
```bash
git clone ...
cd codedna/backend && pip install -r requirements.txt
cp .env.example .env  # Add your Google AI Studio key
uvicorn main:app --reload

cd ../frontend && npm install && npm run dev
```

## Get Your Git Log
```bash
git log --oneline --stat | head -2000 > my_history.txt
```
Paste contents into CodeDNA.

## Architecture
[Simple diagram: Input → Preprocessor → Gemma 4 → JSON → React UI]

## Built For
Google Gemma 4 Challenge — May 2026
```

---

## 9. MODEL SELECTION — HONEST VERSION

| Task | Model | Why |
|---|---|---|
| All coding (backend + frontend) | Claude Sonnet 4.6 | Best code quality, consistent context |
| Debugging weird errors | Claude Sonnet 4.6 | Same context, no switching cost |
| Prompt engineering for Gemma | Claude Sonnet 4.6 | Best at writing prompts for other models |
| Article writing | Claude Sonnet 4.6 | Best prose |
| The actual LLM in the product | Gemma 4 (Google AI Studio) | Required by competition |

**Why not Opus 4.6:** Too slow for iteration. You'll waste 30 seconds per response when debugging. Sonnet is 95% as good at 3x the speed.  
**Why not Gemini / Kimi:** Context switching between models costs you debugging time. One model, one conversation, consistent context.  
**Exception:** If a specific backend call fails and Sonnet can't figure it out in 2 tries, paste to Gemini as a second opinion. That's it.

---

## 10. 4-DAY HOUR-BY-HOUR PLAN

### Day 1 — May 20 (TODAY) — Pipeline First
```
Evening Session 1 (2 hrs):
  - Get Google AI Studio API key
  - Create project folders
  - Ask Claude Sonnet: "Give me complete backend/main.py and preprocessor.py 
    using the CodeDNA agents.md context"
  - Run: uvicorn main:app --reload

Evening Session 2 (2 hrs):
  - Test master prompt on 3 repos:
    1. A messy personal repo (worst case)
    2. React public repo (demo target)  
    3. A small repo (<50 commits, test fallback)
  - Fix prompt issues
  - Goal: Reliable JSON 8/10 runs before sleep

Gate: Do NOT start frontend until JSON is solid.
```

### Day 2 — May 21 — Backend Complete + SSE
```
Session 1 (2 hrs):
  - Add SSE streaming endpoint
  - Parse + validate JSON → Pydantic models
  - Small repo fallback logic

Session 2 (2 hrs):
  - Test edge cases: empty input, huge input, API timeout
  - Manual test all endpoints with curl
  - Backend is done and frozen

Gate: Backend must be frozen before frontend starts.
```

### Day 3 — May 22 — Frontend
```
Session 1 (3 hrs):
  - Ask Claude: "Give me complete App.tsx, Timeline.tsx, ReasoningPanel.tsx 
    using CodeDNA agents.md — dark terminal aesthetic, animated timeline"
  - Connect to backend
  - Basic flow working end-to-end

Session 2 (2 hrs):
  - Polish animations (timeline building, health score counter)
  - Make the red Bug Storm cluster visually dramatic
  - Test on React repo — this is your demo run
```

### Day 4 — May 23 — Demo + Submit
```
Morning (2 hrs):
  - Record GIF using React repo (follow GIF script above)
  - Record 90-second Loom as backup
  - Write GitHub README

Afternoon (3 hrs):
  - Write DEV.to article (use outline above)
  - Proofread both submissions
  - Submit Build + Write tracks

Evening:
  - Share on Twitter/LinkedIn with GIF
  - Reply to every comment within 1 hour
```

---

## 11. THE "WHY GEMMA 4" DEFENSE (Memorize This)

If a judge asks "couldn't GPT-4 do this?":

> "GPT-4 could generate text about git history. But CodeDNA specifically requires:  
> 1. **Thinking Mode** — not text completion, but actual causal chain reasoning: 'Commit A introduced a pattern that caused regression cluster B 3 weeks later.' That requires step-by-step reasoning, not next-token prediction.  
> 2. **128K context** — feeding a full project's meaningful history in one shot without chunking tricks.  
> 3. **Local-first architecture** — no developer or company will pipe their proprietary git history (containing business logic, security patches, unreleased features) to a cloud API.  
> 4. **Structured output reliability** — Gemma 4's structured output mode drives the entire UI deterministically.  
> These four requirements together make Gemma 4 the only sensible choice."

---

## FINAL CHECKLIST BEFORE SUBMITTING

- [ ] Works on React repo without crashing
- [ ] GIF recorded and under 15 seconds  
- [ ] GitHub README has GIF at top
- [ ] "Why Gemma 4" section in README
- [ ] DEV.to Build submission has GitHub link + GIF
- [ ] DEV.to Write submission published separately
- [ ] Both tagged with #gemmachallenge
- [ ] Replied to all comments within 1 hour of posting

---

*Stop reading. Go get the API key.*

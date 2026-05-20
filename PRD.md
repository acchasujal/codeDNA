1. PROJECT SUMMARY (One-Pager)
Name: CodeDNA
Subtitle: AI Codebase Archaeologist
Tagline: "Feed Gemma 4 your git history. Discover exactly when — and why — your codebase started falling apart."
What it does:
Developer pastes git log → Gemma 4 (Thinking Mode) reconstructs the codebase's story → animated timeline with bug storms, pivots, refactor eras → live reasoning sidebar → exportable Markdown report.
Why it wins:

Output is 100% verifiable (judge checks against real commits)
Strong emotional hook (every dev has a codebase they're ashamed of)
Live Thinking Mode = visible, intentional Gemma 4 use
Underserved niche in current entries (no strong narrative timeline exists yet)
Works reliably without powerful hardware (API-first)

Tracks: Build With Gemma 4 + Write About Gemma 4
Solo build: Yes
Target: Top 5 in Build, Top 3 in Write

2. PRD — PRODUCT REQUIREMENTS DOCUMENT
Problem Statement
Developers inherit codebases, work on them for years, and have no intuitive way to understand when things degraded, why certain periods were chaotic, or what decisions caused current technical debt. Git history contains all this — but nobody reads 2000 commits manually.
Solution
CodeDNA uses Gemma 4's Thinking Mode + 128K context to process a codebase's commit history and return a structured, human-readable narrative: milestones, bug storms, refactor eras, and an overall health score — with live reasoning visible to the user.
Users

Developers inheriting legacy codebases
Engineering managers reviewing team history
Solo developers auditing their own old projects
(For demo: judges reviewing the React public repo)

Core User Flow
1. User pastes git log --oneline --stat OR uploads .txt file
2. Clicks "Analyze with Gemma 4"
3. Sees live Thinking Mode tokens streaming in right panel
4. Timeline builds itself left panel (animated, color-coded)
5. Health score + key metrics appear top center
6. User can export Markdown summary
MVP Features (MUST ship)
FeaturePriorityNotesGit log paste inputP0Also accept .txt file uploadAuto-preprocessingP0Cap at 400 commits, clean formatGemma 4 API callP0Via Google AI StudioStructured JSON outputP0Milestone, type, severity, commitsAnimated vertical timelineP0Color: red=bug, yellow=refactor, green=pivotLive Thinking Mode sidebarP0SSE streamingHealth score displayP00–100, prominentSmall repo fallbackP1Graceful message if <50 commitsMarkdown exportP1One button
Cut Completely (Do Not Build)

GitHub OAuth / GitHub API integration
Full diff analysis
Multi-repo comparison
Neo4j or any database
Force-directed graph
Branch visualization
User accounts
Deployment (local run is fine for demo)

Success Criteria for Submission

 Works reliably on React public repo (the demo target)
 GIF is 12–15 seconds, shows all 3 panels
 "Why Gemma 4" argument is airtight in README
 Article is publishable on DEV.to with emotional hook
 No broken states or crashes during demo


3. TECHNICAL SPEC
Stack
Backend:   FastAPI (Python 3.11+)
Frontend:  React 18 + Vite + Tailwind CSS
LLM:       Google Gemma 4 via AI Studio API (gemma-4-thinking or gemma-4-it)
Streaming: SSE (Server-Sent Events) for Thinking Mode
State:     In-memory only (no DB)
Folder Structure
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
API Endpoints
POST /analyze          # Accepts git log text, returns JSON analysis
GET  /analyze/stream   # SSE endpoint for Thinking Mode tokens
GET  /health           # Basic health check
Data Flow
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
Environment Variables
GEMINI_API_KEY=your_google_ai_studio_key
GEMMA_MODEL=gemma-2.0-flash-thinking-exp  # or latest available
MAX_COMMITS=400
PORT=8000
Commit Color Coding
bug_storm    → red     (#EF4444)
refactor     → yellow  (#F59E0B)  
pivot        → green   (#10B981)
feature_burst→ blue    (#3B82F6)
stability    → gray    (#6B7280)
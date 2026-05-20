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
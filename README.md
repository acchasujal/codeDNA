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
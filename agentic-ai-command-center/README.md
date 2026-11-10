# Agentic AI Command Center

A full-stack visual AI workspace powered by FastAPI, LangGraph, Gemini 3.5 Flash, React, and @xyflow/react.

## Quick Start (One-Click)

Double-click `start-all.bat` or run:
```bat
.\start-all.bat
```
This opens both the Backend (FastAPI on port 8000) and Frontend (Vite on port 5173).

## Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS/Linux**
```bash
source .venv/bin/activate
```

Install dependencies and configure the key:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env`, then add your key:

```env
GOOGLE_API_KEY=your_actual_key
```

Run the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check: http://localhost:8000/api/health  
API docs: http://localhost:8000/docs

## Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

Optional: create `frontend/.env` to change the API base URL:

```env
VITE_API_URL=http://localhost:8000
```

## Example prompts

- What's the weather in Nagpur?
- Find trending GitHub repositories about AI agents.
- Schedule a task to revise Python tomorrow at 7 PM.

## Important production notes

The three tools currently return mock data. The scheduler does not create a real calendar event, and the GitHub search does not call GitHub's API.

Before public deployment:
- Restrict CORS to your deployed frontend origin.
- Add authentication, rate limiting, request quotas, and structured logging.
- Keep API keys only in backend environment variables or a secrets manager.
- Add persistence and per-user thread IDs if you need multi-turn agent memory.
- Add timeouts, retries, and safer exception handling.
- Replace mock tools with real integrations and validate their outputs.
- Do not expose private chain-of-thought. The UI displays execution events and tool activity, not hidden model reasoning.

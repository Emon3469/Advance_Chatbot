# Nexio AI

An agentic AI chat assistant with real-time streaming responses, tool use, document Q&A and automatic multi-model fallback.

**Frontend:** Next.js 16, React 19, Tailwind CSS 4 (deployed on Vercel)
**Backend:** FastAPI, LangGraph, LangChain (deployed on Render)

## Features

- Token-by-token streaming over Server-Sent Events
- Automatic LLM fallback: OpenAI → Anthropic → Groq → Groq Lite, with smart cooldowns for failing or rate-limited providers
- Token-budgeted conversation memory to keep requests fast and within free-tier limits
- Tools: live web search (Tavily, DuckDuckGo backup), calculator, stock quotes, weather, document search
- Human approval step for simulated stock orders
- Upload PDF / TXT / MD / CSV / JSON files and ask questions about them (hybrid keyword and semantic search)
- Persistent conversations with rename, delete, search and agent filter
- Agent personas, prompt library with `/` commands, voice input and a responsive layout

## Project structure

```
backend/
  app/
    main.py      API routes and SSE streaming
    graph.py     LangGraph agent
    llm.py       Model router with fallback
    tools.py     Agent tools
    rag.py       Document indexing and retrieval
    store.py     Conversation metadata
    agents.py    Agent personas and system prompt
    config.py    Settings from environment variables
  requirements.txt
frontend/
  src/app         Layout, page, favicon
  src/components  UI components
  src/hooks       Chat state and streaming
  src/lib         API client and helpers
render.yaml       Render blueprint for the backend
```

## Running locally

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Environment variables

Backend: see `backend/.env.example`. At least one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY` is required. All tool keys are optional; free fallbacks are used when they are missing.

Frontend: `NEXT_PUBLIC_API_URL` must point to the backend URL.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/meta` | Providers, agents, tools and upload limits |
| GET | `/api/threads` | List conversations |
| GET | `/api/threads/{id}/messages` | Conversation history |
| PATCH | `/api/threads/{id}` | Rename a conversation |
| DELETE | `/api/threads/{id}` | Delete a conversation |
| GET / POST | `/api/threads/{id}/documents` | List or upload documents |
| POST | `/api/chat` | Send a message (SSE stream) |
| POST | `/api/chat/resume` | Approve or reject a pending action (SSE stream) |

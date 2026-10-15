import asyncio
import json
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from pydantic import BaseModel, Field

from .agents import public_agents
from .config import settings
from .graph import build_graph
from .llm import PROVIDER_LABELS, ModelRouter, NoProviderConfigured, friendly_error
from .rag import SUPPORTED_EXTENSIONS, DocumentError, documents
from .store import ThreadStore, make_title, plain_text
from .tools import TOOL_LABELS, TOOLS, close_http

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("nexio")

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = ThreadStore(settings.db_path)
    await store.open()
    async with AsyncSqliteSaver.from_conn_string(str(settings.db_path)) as saver:
        router = ModelRouter(TOOLS)
        app.state.store = store
        app.state.router = router
        app.state.saver = saver
        app.state.graph = build_graph(router, saver)
        app.state.started_at = time.time()
        yield
    await store.close()
    await close_http()


app = FastAPI(title=f"{settings.app_name} API", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)


class ChatRequest(BaseModel):
    thread_id: str = Field(..., min_length=6, max_length=64)
    message: str = Field(..., min_length=1, max_length=20000)
    provider: str = "auto"
    agent: str = "general"
    web_search: bool = False


class ResumeRequest(BaseModel):
    thread_id: str = Field(..., min_length=6, max_length=64)
    decision: Literal["approve", "reject"]
    provider: str = "auto"
    agent: str = "general"


class RenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


def client_id(x_client_id: str | None = Header(default=None)) -> str:
    if x_client_id and ID_PATTERN.match(x_client_id):
        return x_client_id
    return "anonymous"


def validate_id(thread_id: str) -> str:
    if not ID_PATTERN.match(thread_id):
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    return thread_id


async def owned_thread(request: Request, thread_id: str, owner: str) -> dict | None:
    validate_id(thread_id)
    thread = await request.app.state.store.get(thread_id)
    if thread and thread["owner"] != owner:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return thread


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def chunk_text(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
            if not isinstance(block, dict) or block.get("type") in (None, "text", "text_delta")
        )
    return ""


def pending_interrupt(snapshot) -> Any | None:
    for item in getattr(snapshot, "interrupts", ()) or ():
        return item
    for task in getattr(snapshot, "tasks", ()) or ():
        for item in getattr(task, "interrupts", ()) or ():
            return item
    return None


def run_config(thread_id: str, provider: str, agent: str, web_search: bool = False) -> dict:
    return {
        "configurable": {
            "thread_id": thread_id,
            "provider": provider if provider in PROVIDER_LABELS else None,
            "agent": agent,
            "web_search": web_search,
        },
        "recursion_limit": 25,
    }


async def stream_graph(request: Request, payload: Any, config: dict, thread_id: str,
                       title: str) -> AsyncIterator[str]:
    graph = request.app.state.graph
    store: ThreadStore = request.app.state.store
    answer: list[str] = []
    provider_sent: str | None = None
    started = time.perf_counter()
    first_token_ms: int | None = None

    yield sse("start", {"thread_id": thread_id, "title": title})
    try:
        async for event in graph.astream_events(payload, config, version="v2"):
            kind = event["event"]
            metadata = event.get("metadata", {})
            if kind == "on_chat_model_stream" and metadata.get("langgraph_node") == "chat_node":
                provider = metadata.get("provider") or metadata.get("ls_provider")
                if provider and provider != provider_sent:
                    provider_sent = provider
                    yield sse("provider", {
                        "id": provider,
                        "label": PROVIDER_LABELS.get(provider, provider),
                        "model": metadata.get("ls_model_name"),
                    })
                text = chunk_text(event["data"].get("chunk"))
                if text:
                    if first_token_ms is None:
                        first_token_ms = int((time.perf_counter() - started) * 1000)
                    answer.append(text)
                    yield sse("token", {"content": text})
            elif kind == "on_tool_start" and event.get("name") in TOOL_LABELS:
                yield sse("tool", {
                    "id": event["run_id"],
                    "name": event["name"],
                    "label": TOOL_LABELS[event["name"]],
                    "status": "running",
                })
            elif kind in ("on_tool_end", "on_tool_error") and event.get("name") in TOOL_LABELS:
                status = "done"
                if kind == "on_tool_error":
                    error = event.get("data", {}).get("error")
                    status = "waiting" if "interrupt" in type(error).__name__.lower() else "error"
                yield sse("tool", {
                    "id": event["run_id"],
                    "name": event["name"],
                    "label": TOOL_LABELS[event["name"]],
                    "status": status,
                })

        snapshot = await graph.aget_state(config)
        waiting = pending_interrupt(snapshot)
        if waiting is not None:
            yield sse("interrupt", {"message": str(getattr(waiting, "value", waiting))})

        text = "".join(answer).strip()
        await store.touch(thread_id, preview=make_title(plain_text(text), 90) if text else None,
                          agent=config["configurable"]["agent"], added_messages=1)
        yield sse("done", {
            "thread_id": thread_id,
            "provider": provider_sent,
            "first_token_ms": first_token_ms,
            "total_ms": int((time.perf_counter() - started) * 1000),
            "awaiting_approval": waiting is not None,
        })
    except asyncio.CancelledError:
        raise
    except NoProviderConfigured as exc:
        yield sse("error", {"message": str(exc)})
    except Exception as exc:
        logger.exception("Chat stream failed for %s", thread_id)
        yield sse("error", {"message": friendly_error(exc)})


def streaming_response(generator: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def cancel_pending_actions(graph, config: dict) -> None:
    snapshot = await graph.aget_state(config)
    if pending_interrupt(snapshot) is None:
        return
    last = snapshot.values.get("messages", [])[-1:] if snapshot.values else []
    calls = last[0].tool_calls if last and isinstance(last[0], AIMessage) else []
    if calls:
        await graph.aupdate_state(
            config,
            {"messages": [
                ToolMessage(content="Cancelled: the user moved on without approving.",
                            tool_call_id=call["id"], name=call["name"])
                for call in calls
            ]},
            as_node="tools",
        )


@app.get("/")
async def root():
    return {"name": settings.app_name, "version": settings.app_version, "status": "ok"}


@app.get("/api/health")
async def health(request: Request):
    return {
        "status": "ok",
        "uptime_seconds": int(time.time() - request.app.state.started_at),
        "providers": request.app.state.router.available,
    }


@app.get("/api/meta")
async def meta(request: Request):
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "providers": request.app.state.router.describe(),
        "agents": public_agents(),
        "tools": [{"id": name, "label": label} for name, label in TOOL_LABELS.items()],
        "upload": {"max_mb": settings.max_upload_mb, "extensions": sorted(SUPPORTED_EXTENSIONS)},
    }


@app.get("/api/threads")
async def list_threads(request: Request, owner: str = Depends(client_id)):
    return await request.app.state.store.list(owner)


@app.get("/api/threads/{thread_id}/messages")
async def thread_messages(thread_id: str, request: Request, owner: str = Depends(client_id)):
    thread = await owned_thread(request, thread_id, owner)
    if not thread:
        return {"thread": None, "messages": [], "pending_approval": None}

    graph = request.app.state.graph
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    raw = (snapshot.values or {}).get("messages", [])

    messages: list[dict] = []
    tools_used: list[str] = []
    for index, message in enumerate(raw):
        if isinstance(message, HumanMessage):
            tools_used = []
            messages.append({"id": message.id or f"u{index}", "role": "user", "content": chunk_text(message)})
        elif isinstance(message, ToolMessage):
            if message.name in TOOL_LABELS and message.name not in tools_used:
                tools_used.append(message.name)
        elif isinstance(message, (AIMessage, AIMessageChunk)):
            text = chunk_text(message)
            if text.strip():
                messages.append({
                    "id": message.id or f"a{index}",
                    "role": "assistant",
                    "content": text,
                    "tools": [{"name": n, "label": TOOL_LABELS[n], "status": "done"} for n in tools_used],
                    "provider": (message.response_metadata or {}).get("model_provider"),
                })
                tools_used = []

    waiting = pending_interrupt(snapshot)
    return {
        "thread": {k: v for k, v in thread.items() if k != "owner"},
        "messages": messages,
        "pending_approval": str(getattr(waiting, "value", waiting)) if waiting is not None else None,
    }


@app.patch("/api/threads/{thread_id}")
async def rename_thread(thread_id: str, body: RenameRequest, request: Request,
                        owner: str = Depends(client_id)):
    if not await owned_thread(request, thread_id, owner):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await request.app.state.store.rename(thread_id, body.title.strip())
    return {"ok": True}


@app.delete("/api/threads/{thread_id}")
async def delete_thread(thread_id: str, request: Request, owner: str = Depends(client_id)):
    if not await owned_thread(request, thread_id, owner):
        raise HTTPException(status_code=404, detail="Conversation not found")
    await request.app.state.store.delete(thread_id)
    await request.app.state.saver.adelete_thread(thread_id)
    await asyncio.to_thread(documents.delete_thread, thread_id)
    return {"ok": True}


@app.get("/api/threads/{thread_id}/documents")
async def list_documents(thread_id: str, request: Request, owner: str = Depends(client_id)):
    if not await owned_thread(request, thread_id, owner):
        return []
    return documents.list_files(thread_id)


@app.post("/api/threads/{thread_id}/documents")
async def upload_document(thread_id: str, request: Request, file: UploadFile = File(...),
                          owner: str = Depends(client_id)):
    await owned_thread(request, thread_id, owner)
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File is larger than {settings.max_upload_mb} MB")
    filename = (file.filename or "document").replace("\\", "/").split("/")[-1][:120]
    try:
        record = await asyncio.to_thread(documents.ingest, thread_id, filename, data)
    except DocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await request.app.state.store.ensure(thread_id, owner, make_title(filename), "doc_analyst")
    await request.app.state.store.touch(thread_id)
    return record


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request, owner: str = Depends(client_id)):
    thread = await owned_thread(request, body.thread_id, owner)
    store: ThreadStore = request.app.state.store
    if not thread:
        thread = await store.ensure(body.thread_id, owner, make_title(body.message), body.agent)
    elif thread["message_count"] == 0:
        await store.rename(body.thread_id, make_title(body.message))
        thread["title"] = make_title(body.message)
    await store.touch(body.thread_id, added_messages=1)

    config = run_config(body.thread_id, body.provider, body.agent, body.web_search)
    await cancel_pending_actions(request.app.state.graph, config)
    payload = {"messages": [HumanMessage(content=body.message.strip())]}
    return streaming_response(stream_graph(request, payload, config, body.thread_id, thread["title"]))


@app.post("/api/chat/resume")
async def resume(body: ResumeRequest, request: Request, owner: str = Depends(client_id)):
    thread = await owned_thread(request, body.thread_id, owner)
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    config = run_config(body.thread_id, body.provider, body.agent)
    payload = Command(resume="yes" if body.decision == "approve" else "no")
    return streaming_response(stream_graph(request, payload, config, body.thread_id, thread["title"]))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

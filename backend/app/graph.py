from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from .agents import build_system_prompt
from .config import settings
from .llm import ModelRouter
from .rag import documents
from .tools import TOOLS


class ChatState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


def _sanitize(messages: list[AnyMessage]) -> list[AnyMessage]:
    answered = {m.tool_call_id for m in messages if isinstance(m, ToolMessage)}
    requested: set[str] = set()
    clean: list[AnyMessage] = []
    for message in messages:
        if isinstance(message, AIMessage) and message.tool_calls:
            if not all(call["id"] in answered for call in message.tool_calls):
                if message.content:
                    clean.append(AIMessage(content=message.content, id=message.id))
                continue
            requested.update(call["id"] for call in message.tool_calls)
        if isinstance(message, ToolMessage) and message.tool_call_id not in requested:
            continue
        clean.append(message)
    return clean


def _tokens(message: AnyMessage) -> int:
    content = message.content if isinstance(message.content, str) else str(message.content)
    return len(content) // 4 + 8


def _compact(turn: list[AnyMessage], limit: int = 1500) -> list[AnyMessage]:
    compact: list[AnyMessage] = []
    for message in turn:
        if isinstance(message, ToolMessage) or (isinstance(message, AIMessage) and not message.content):
            continue
        content = message.content if isinstance(message.content, str) else str(message.content)
        if len(content) > limit:
            content = content[:limit] + " …"
        if isinstance(message, HumanMessage):
            compact.append(HumanMessage(content=content, id=message.id))
        else:
            compact.append(AIMessage(content=content, id=message.id))
    return compact


def _window(messages: list[AnyMessage], size: int, budget: int | None = None) -> list[AnyMessage]:
    budget = budget or settings.history_token_budget
    recent = messages[-size:] if len(messages) > size else messages
    starts = [i for i, m in enumerate(recent) if isinstance(m, HumanMessage)]
    if not starts:
        return _sanitize(recent)
    recent = _sanitize(recent[starts[0]:])
    starts = [i for i, m in enumerate(recent) if isinstance(m, HumanMessage)]

    current = recent[starts[-1]:]
    used = sum(_tokens(m) for m in current)
    kept: list[AnyMessage] = []
    bounds = starts + [len(recent)]
    for begin, end in reversed(list(zip(bounds[:-2], bounds[1:-1]))):
        turn = _compact(recent[begin:end])
        cost = sum(_tokens(m) for m in turn)
        if used + cost > budget:
            break
        kept = turn + kept
        used += cost
    return kept + current


def build_graph(router: ModelRouter, checkpointer):
    async def chat_node(state: ChatState, config: RunnableConfig):
        options = config.get("configurable", {})
        thread_id = options.get("thread_id")
        system = build_system_prompt(
            settings.app_name,
            options.get("agent"),
            web_search=bool(options.get("web_search")),
            documents=[f["name"] for f in documents.list_files(thread_id)] if thread_id else None,
        )
        history = _window(state["messages"], settings.history_window)
        response = await router.chain(options.get("provider")).ainvoke(
            [SystemMessage(content=system), *history], config
        )
        return {"messages": [response]}

    graph = StateGraph(ChatState)
    graph.add_node("chat_node", chat_node)
    graph.add_node("tools", ToolNode(TOOLS, handle_tool_errors=True))
    graph.add_edge(START, "chat_node")
    graph.add_conditional_edges("chat_node", tools_condition, {"tools": "tools", END: END})
    graph.add_edge("tools", "chat_node")
    return graph.compile(checkpointer=checkpointer)

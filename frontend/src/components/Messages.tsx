"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  CircleAlert,
  Copy,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage, ToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { Orb } from "./Orb";

export function Messages() {
  const { messages, loadingThread, pendingApproval, streaming } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingApproval]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  if (loadingThread && !messages.length) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-sky-300" />
      </div>
    );
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin h-full overflow-y-auto px-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <AssistantBubble
                key={message.id}
                message={message}
                isLast={message.id === lastAssistant?.id && !streaming}
              />
            ),
          )}
          {pendingApproval && <ApprovalCard text={pendingApproval} />}
        </div>
      </div>
      {showJump && (
        <button
          onClick={jump}
          className="glass absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-slate-200 shadow-xl"
          aria-label="Scroll to latest"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="animate-fade-up flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-[#3a86ff] to-[#2563eb] px-4 py-2.5 text-[0.95rem] leading-relaxed text-white shadow-lg shadow-blue-900/30">
        {message.content}
      </div>
    </div>
  );
}

function ToolChip({ tool }: { tool: ToolCall }) {
  const Icon =
    tool.status === "running" ? LoaderCircle : tool.status === "error" ? X : tool.status === "waiting" ? ShieldCheck : Check;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
        tool.status === "running" && "bg-sky-500/10 text-sky-200 ring-sky-400/30",
        tool.status === "done" && "bg-emerald-500/10 text-emerald-200 ring-emerald-400/25",
        tool.status === "waiting" && "bg-amber-500/10 text-amber-200 ring-amber-400/30",
        tool.status === "error" && "bg-slate-500/10 text-slate-300 ring-slate-400/20",
      )}
    >
      <Icon className={cn("h-3 w-3", tool.status === "running" && "animate-spin")} />
      {tool.status === "waiting" ? "Awaiting approval" : tool.label}
    </span>
  );
}

function AssistantBubble({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const { regenerate } = useChat();
  const [copied, setCopied] = useState(false);
  const tools = message.tools ?? [];
  const thinking = message.streaming && !message.content && !tools.some((t) => t.status === "running");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="animate-fade-up flex gap-3">
      <Orb size={30} active={message.streaming} className="mt-1" />
      <div className="min-w-0 flex-1">
        {tools.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tools.map((tool, i) => (
              <ToolChip key={tool.id ?? `${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        )}

        {thinking && <p className="shimmer-text text-sm font-medium">Thinking…</p>}

        {message.content && (
          <div className={cn("prose-chat", message.streaming && "caret")}>
            <Markdown content={message.content} />
          </div>
        )}

        {message.error && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{message.error}</span>
          </div>
        )}

        {!message.streaming && (message.content || message.error) && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
            {message.content && (
              <button onClick={copy} className="flex items-center gap-1 transition hover:text-slate-200">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {isLast && (
              <button onClick={regenerate} className="flex items-center gap-1 transition hover:text-slate-200">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
            {message.provider && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {message.provider}
                {message.firstTokenMs ? ` · ${(message.firstTokenMs / 1000).toFixed(1)}s` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({ text }: { text: string }) {
  const { resume, streaming } = useChat();
  return (
    <div className="animate-fade-up ml-[42px] rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldCheck className="h-4 w-4" />
        Approval required
      </div>
      <p className="mt-1.5 text-sm text-slate-200">{text}</p>
      <p className="mt-1 text-[11px] text-slate-400">This is a simulated order. No real trade will be placed.</p>
      <div className="mt-3 flex gap-2">
        <button
          disabled={streaming}
          onClick={() => resume("approve")}
          className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={streaming}
          onClick={() => resume("reject")}
          className="rounded-lg bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

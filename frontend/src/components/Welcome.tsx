"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgentIcon } from "./AgentIcon";
import { Orb } from "./Orb";

const FEATURED = ["youtube_writer", "cold_email", "market_analyst", "researcher"];

export function Welcome() {
  const { meta, agent, setAgent, setDraft, setPanel, setSidebarOpen } = useChat();
  const [showAll, setShowAll] = useState(false);
  const agents = meta?.agents ?? [];
  const featured = FEATURED.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as Agent[];
  const current = agents.find((a) => a.id === agent);

  useEffect(() => {
    if (!showAll) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowAll(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showAll]);

  const choose = (a: Agent) => {
    setAgent(a.id);
    setShowAll(false);
  };

  return (
    <div className="animate-fade-up mx-auto flex w-full max-w-[540px] flex-col items-center px-1 pt-2 sm:pt-6">
      <Orb size={92} />
      <h1 className="mt-7 text-center text-[1.65rem] font-bold leading-tight tracking-tight text-white sm:text-[2rem]">
        I&apos;m Your AI Assistant, How <br className="hidden sm:block" />
        Can I Assist You Today..?
      </h1>

      <div className="mt-8 w-full">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-white">Your AI agents</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPanel("agents");
                setSidebarOpen(true);
              }}
              className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              Edit
            </button>
            <button
              onClick={() => setShowAll(true)}
              className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              View all ({agents.length || 0})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {featured.length
            ? featured.map((a) => <AgentCard key={a.id} agent={a} active={agent === a.id} onClick={() => choose(a)} />)
            : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-item h-[92px] animate-pulse rounded-2xl" />
              ))}
        </div>

        {current && current.starters.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {current.starters.map((s) => (
              <button
                key={s}
                onClick={() => setDraft(s)}
                className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {showAll &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowAll(false)}
          >
            <div
              className="glass animate-fade-up max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 scroll-thin"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">All AI agents</h3>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-slate-400 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {agents.map((a) => (
                  <AgentCard key={a.id} agent={a} active={agent === a.id} onClick={() => choose(a)} />
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function AgentCard({ agent, active, onClick }: { agent: Agent; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-2xl p-3 text-left transition duration-200 hover:-translate-y-0.5 sm:gap-3 sm:p-3.5",
        active ? "card-active" : "card-item",
      )}
    >
      <span className="sm:hidden">
        <AgentIcon icon={agent.icon} accent={agent.accent} size="sm" />
      </span>
      <span className="hidden sm:inline-flex">
        <AgentIcon icon={agent.icon} accent={agent.accent} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white sm:truncate sm:text-sm">
          {agent.name}
        </p>
        <p className="mt-1 hidden text-[11px] leading-snug text-slate-300/80 sm:block">
          <span className="line-clamp-3">{agent.description}</span>
        </p>
      </div>
    </button>
  );
}

"use client";

import { ClipboardList, FolderOpen, MessageSquareText, PanelLeft, Settings, UserRound, Users } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import type { Panel } from "@/lib/types";
import { cn } from "@/lib/utils";

const ITEMS: { id: Panel; label: string; icon: typeof MessageSquareText }[] = [
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "prompts", label: "Prompt", icon: ClipboardList },
  { id: "agents", label: "Agents", icon: Users },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "settings", label: "Setting", icon: Settings },
];

export function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { panel, setPanel } = useChat();

  const open = (id: Panel) => {
    setPanel(id);
    if (collapsed) onToggle();
  };

  return (
    <nav className="glass flex h-full w-[72px] shrink-0 flex-col items-center rounded-2xl py-4">
      <button
        onClick={onToggle}
        className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/5 hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <div className="flex flex-1 flex-col items-center gap-3">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = panel === id && !collapsed;
          return (
            <button
              key={id}
              onClick={() => open(id)}
              className={cn(
                "flex h-[58px] w-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition",
                active
                  ? "btn-primary text-white"
                  : "bg-white/[0.04] text-slate-300 ring-1 ring-white/5 hover:bg-white/[0.08] hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => open("settings")}
        className="flex h-[58px] w-[54px] flex-col items-center justify-center gap-1 rounded-xl bg-white text-[11px] font-semibold text-slate-800 shadow-lg shadow-black/30 transition hover:bg-slate-100"
      >
        <UserRound className="h-[18px] w-[18px]" />
        Profile
      </button>
    </nav>
  );
}

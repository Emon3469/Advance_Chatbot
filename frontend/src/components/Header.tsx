"use client";

import { useCallback, useState } from "react";
import { Crown, Menu, X } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useOutsideClose } from "@/hooks/useOutsideClose";
import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Nexio AI";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "v4.3";

export function Header() {
  const { setSidebarOpen, meta, connection, threads, activeId, messages } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, useCallback(() => setOpen(false), []));
  const title = messages.length ? threads.find((t) => t.id === activeId)?.title : null;

  return (
    <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-200 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/90">
            {APP_NAME} <span className="text-white/60">{APP_VERSION}</span>
          </p>
          {title && <p className="hidden truncate text-xs text-slate-400 sm:block">{title}</p>}
        </div>
      </div>

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-teal flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Crown className="h-4 w-4" />
          Upgrade AI
        </button>

        {open && (
          <div className="popover animate-fade-up absolute right-0 top-12 w-72 rounded-2xl p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Model lineup</p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {(meta?.providers ?? []).map((p, index) => (
                <div key={p.id} className="glass-soft flex items-center justify-between rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {index + 1}. {p.label}
                    </p>
                    <p className="text-[11px] text-slate-400">{p.model}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      !p.available
                        ? "bg-slate-500/20 text-slate-400"
                        : p.healthy
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300",
                    )}
                  >
                    {!p.available ? "Not set" : p.healthy ? "Ready" : "Standby"}
                  </span>
                </div>
              ))}
              {!meta && (
                <p className="text-xs text-slate-400">
                  {connection === "offline" ? "Server is offline." : "Connecting to server…"}
                </p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Requests automatically fall back to the next model if one is slow or unavailable.
            </p>
          </div>
        )}
      </div>
    </header>
  );
}

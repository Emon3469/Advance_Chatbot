"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, RefreshCw } from "lucide-react";
import { ChatProvider, useChat } from "@/hooks/useChat";
import { cn, readStorage, writeStorage } from "@/lib/utils";
import { Composer } from "./Composer";
import { Header } from "./Header";
import { Messages } from "./Messages";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";
import { Welcome } from "./Welcome";

export function ChatApp() {
  return (
    <ChatProvider>
      <Shell />
    </ChatProvider>
  );
}

function Shell() {
  const { messages, loadingThread, sidebarOpen, setSidebarOpen } = useChat();
  const [collapsed, setCollapsed] = useState(() => readStorage("nexio.sidebar-collapsed", false));
  const hasChat = messages.length > 0 || loadingThread;

  const toggle = () => {
    setCollapsed((value) => {
      writeStorage("nexio.sidebar-collapsed", !value);
      return !value;
    });
  };

  return (
    <div className="app-bg flex h-dvh w-full gap-3 overflow-hidden p-2.5 sm:p-3">
      <div className="hidden lg:flex">
        <Rail collapsed={collapsed} onToggle={toggle} />
      </div>

      <div
        className={cn(
          "hidden shrink-0 transition-[width,opacity] duration-300 lg:block",
          collapsed ? "w-0 overflow-hidden opacity-0" : "w-[300px] opacity-100",
        )}
      >
        <div className="h-full w-[300px]">
          <Sidebar />
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="app-bg animate-fade-up relative flex h-full w-[min(92vw,380px)] gap-2 p-2.5">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-blue-600/25 blur-[120px]" />
        <Header />
        <ConnectionBanner />

        {hasChat ? (
          <>
            <Messages />
            <div className="px-3 pb-3 sm:px-6">
              <Composer wide />
              <Disclaimer />
            </div>
          </>
        ) : (
          <div className="scroll-thin relative flex flex-1 flex-col overflow-y-auto px-4 pb-3 sm:px-6">
            <div className="my-auto py-4">
              <Welcome />
              <div className="mt-6">
                <Composer />
              </div>
              <Disclaimer />
            </div>
          </div>
        )}
      </main>

      <Toast />
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="mt-3 text-center text-[11px] text-slate-400">
      {process.env.NEXT_PUBLIC_APP_NAME || "Nexio AI"} may make mistakes. We recommend checking important information.{" "}
      <a href="#" onClick={(e) => e.preventDefault()} className="text-sky-300 underline underline-offset-2">
        Privacy Notice
      </a>
    </p>
  );
}

function ConnectionBanner() {
  const { connection, reconnect } = useChat();
  if (connection === "online" || connection === "connecting") return null;

  return (
    <div className="relative z-10 mx-auto mt-3 flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-100">
      {connection === "waking" ? (
        <>
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Waking up the server, this can take up to a minute on first load…
        </>
      ) : (
        <>
          <CircleAlert className="h-3.5 w-3.5" />
          Server is unreachable.
          <button onClick={reconnect} className="inline-flex items-center gap-1 font-semibold underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </>
      )}
    </div>
  );
}

function Toast() {
  const { notice } = useChat();
  if (!notice) return null;
  const Icon = notice.tone === "error" ? CircleAlert : notice.tone === "success" ? CircleCheck : Info;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div
        key={notice.id}
        className={cn(
          "glass animate-fade-up flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-2xl",
          notice.tone === "error" ? "text-rose-200" : notice.tone === "success" ? "text-emerald-200" : "text-slate-100",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {notice.text}
      </div>
    </div>
  );
}

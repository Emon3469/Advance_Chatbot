"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useOutsideClose } from "@/hooks/useOutsideClose";
import { PROMPTS } from "@/lib/prompts";
import type { Agent, Panel } from "@/lib/types";
import { API_URL } from "@/lib/api";
import { cn, formatBytes, relativeTime } from "@/lib/utils";
import { AgentIcon } from "./AgentIcon";

const PANEL_TITLES: Record<Panel, { title: string; icon: typeof Folder }> = {
  chat: { title: "Conversations", icon: Folder },
  prompts: { title: "Prompt Library", icon: ClipboardList },
  agents: { title: "AI Agents", icon: Users },
  files: { title: "Files", icon: FolderOpen },
  settings: { title: "Settings", icon: Settings },
};

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { panel, setPanel, newChat, threads, activeId, deleteThread, meta, files } = useChat();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useOutsideClose(filterOpen, useCallback(() => setFilterOpen(false), []));

  const header = PANEL_TITLES[panel];
  const count =
    panel === "chat"
      ? threads.length
      : panel === "prompts"
        ? PROMPTS.length
        : panel === "agents"
          ? meta?.agents.length ?? 0
          : panel === "files"
            ? files.length
            : meta?.providers.filter((p) => p.available).length ?? 0;

  const activeThread = threads.find((t) => t.id === activeId);
  const filterAgent = meta?.agents.find((a) => a.id === agentFilter);

  return (
    <aside className="flex h-full w-full flex-col gap-3">
      <div className="glass rounded-2xl p-3">
        <div className="flex gap-2">
          <button
            onClick={newChat}
            className="btn-primary flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition"
          >
            <SquarePen className="h-4 w-4" />
            New Chat
          </button>
          <button
            onClick={() => setPanel("settings")}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-800 shadow-md transition hover:bg-slate-100"
            aria-label="Profile and settings"
          >
            <UserRound className="h-5 w-5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-slate-300 lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <label className="glass-soft flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-sm text-slate-300 focus-within:ring-1 focus-within:ring-sky-400/50">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={panel === "chat" ? "Search chats" : "Search"}
              className="min-w-0 flex-1 bg-transparent text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          {(
            [
              ["files", FolderOpen, "Files"],
              ["agents", LayoutGrid, "Agents"],
              ["settings", Bot, "Models"],
              ["prompts", ListChecks, "Prompts"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setPanel(id)}
              title={label}
              aria-label={label}
              className={cn(
                "flex h-9 w-8 items-center justify-center rounded-lg transition",
                panel === id ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
      </div>

      <div className="glass flex min-h-0 flex-1 flex-col rounded-2xl p-3">
        <div className="glass-soft flex items-center justify-between rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <header.icon className="h-4 w-4 text-sky-300" />
            {header.title} ({count})
          </div>
          {panel === "chat" && (
            <div className="flex items-center gap-1 text-slate-300">
              <button onClick={newChat} className="rounded-md p-1 hover:bg-white/10 hover:text-white" aria-label="New chat">
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => activeThread && setRenaming(activeThread.id)}
                disabled={!activeThread}
                className="rounded-md p-1 hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="Rename current chat"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => activeThread && confirm(`Delete "${activeThread.title}"?`) && deleteThread(activeThread.id)}
                disabled={!activeThread}
                className="rounded-md p-1 hover:bg-white/10 hover:text-rose-300 disabled:opacity-40"
                aria-label="Delete current chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {panel === "chat" && (
          <div ref={filterRef} className="relative mt-2">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-violet-900/40"
            >
              {filterAgent ? filterAgent.name : "All agents"}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {filterOpen && (
              <div className="popover absolute left-0 top-9 z-30 w-56 rounded-xl p-1.5 shadow-2xl">
                {[{ id: "all", name: "All agents" } as Pick<Agent, "id" | "name">, ...(meta?.agents ?? [])].map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAgentFilter(a.id);
                      setFilterOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10"
                  >
                    {a.name}
                    {agentFilter === a.id && <Check className="h-3.5 w-3.5 text-sky-300" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="scroll-thin -mr-1.5 mt-2 min-h-0 flex-1 overflow-y-auto pr-1.5">
          {panel === "chat" && (
            <ThreadList query={query} agentFilter={agentFilter} renaming={renaming} setRenaming={setRenaming} />
          )}
          {panel === "prompts" && <PromptList query={query} />}
          {panel === "agents" && <AgentList query={query} />}
          {panel === "files" && <FileList />}
          {panel === "settings" && <SettingsPanel />}
        </div>
      </div>
    </aside>
  );
}

function ThreadList({
  query,
  agentFilter,
  renaming,
  setRenaming,
}: {
  query: string;
  agentFilter: string;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
}) {
  const { threads, activeId, selectThread, renameThread, deleteThread, meta, connection } = useChat();
  const agents = useMemo(() => new Map((meta?.agents ?? []).map((a) => [a.id, a])), [meta]);

  const visible = threads.filter((t) => {
    if (agentFilter !== "all" && t.agent !== agentFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || t.title.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q);
  });

  if (connection !== "online" && !threads.length) {
    return <EmptyState text="Connecting to your conversations…" spinner />;
  }
  if (!visible.length) {
    return <EmptyState text={query || agentFilter !== "all" ? "No chats match your search." : "No conversations yet. Say hello!"} />;
  }

  return (
    <ul className="space-y-2">
      {visible.map((thread) => {
        const agent = agents.get(thread.agent);
        const active = thread.id === activeId;
        return (
          <li key={thread.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => renaming !== thread.id && selectThread(thread.id)}
              onKeyDown={(e) => e.key === "Enter" && renaming !== thread.id && selectThread(thread.id)}
              className={cn(
                "group card-item relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left transition",
                active && "border-sky-400/40 bg-sky-500/10",
              )}
            >
              <AgentIcon icon={agent?.icon ?? "sparkles"} accent={agent?.accent ?? "sky"} online />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  {renaming === thread.id ? (
                    <input
                      autoFocus
                      defaultValue={thread.title}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        renameThread(thread.id, e.target.value);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="w-full rounded-md bg-white/10 px-1.5 py-0.5 text-sm font-semibold text-white focus:outline-none"
                    />
                  ) : (
                    <p
                      className="truncate text-sm font-semibold text-white"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenaming(thread.id);
                      }}
                    >
                      {thread.title}
                    </p>
                  )}
                  <span className="shrink-0 pt-0.5 text-[10px] text-slate-400 group-hover:hidden">
                    {relativeTime(thread.updated_at)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${thread.title}"?`)) deleteThread(thread.id);
                    }}
                    className="hidden shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-300 group-hover:block"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {agent && agent.id !== "general" && (
                    <span className="shrink-0 rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                      {agent.name.split(" ")[0]}
                    </span>
                  )}
                  <p className="truncate text-xs text-slate-400">{thread.preview || "New conversation"}</p>
                  {active && thread.message_count > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/90 px-1.5 text-[10px] font-bold text-white">
                      {thread.message_count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PromptList({ query }: { query: string }) {
  const { setDraft, setSidebarOpen } = useChat();
  const q = query.trim().toLowerCase();
  const visible = PROMPTS.filter((p) => !q || `${p.title} ${p.category} ${p.text}`.toLowerCase().includes(q));

  if (!visible.length) return <EmptyState text="No prompts match your search." />;

  return (
    <ul className="space-y-2">
      {visible.map((prompt) => (
        <li key={prompt.id}>
          <button
            onClick={() => {
              setDraft(prompt.text);
              setSidebarOpen(false);
            }}
            className="card-item w-full rounded-xl p-3 text-left transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{prompt.title}</span>
              <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">{prompt.category}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{prompt.text}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AgentList({ query }: { query: string }) {
  const { meta, agent, setAgent, setSidebarOpen } = useChat();
  const q = query.trim().toLowerCase();
  const visible = (meta?.agents ?? []).filter((a) => !q || `${a.name} ${a.description}`.toLowerCase().includes(q));

  if (!meta) return <EmptyState text="Loading agents…" spinner />;

  return (
    <ul className="space-y-2">
      {visible.map((a) => (
        <li key={a.id}>
          <button
            onClick={() => {
              setAgent(a.id);
              setSidebarOpen(false);
            }}
            className={cn("card-item flex w-full gap-3 rounded-xl p-3 text-left transition", agent === a.id && "card-active")}
          >
            <AgentIcon icon={a.icon} accent={a.accent} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-white">{a.name}</span>
                {agent === a.id && <Check className="h-3.5 w-3.5 text-emerald-300" />}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-300/80">{a.description}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FileList() {
  const { files, uploadFile, uploading, meta } = useChat();
  const accept = (meta?.upload.extensions ?? [".pdf", ".txt", ".md"]).join(",");

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-sky-400/30 bg-sky-400/5 px-3 py-5 text-center text-xs text-slate-300 transition hover:bg-sky-400/10">
        {uploading ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-300" /> : <Upload className="h-5 w-5 text-sky-300" />}
        <span className="font-medium text-white">{uploading ? "Processing…" : "Upload a document"}</span>
        <span>
          {accept.replaceAll(",", " ")} · up to {meta?.upload.max_mb ?? 15} MB
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {files.length === 0 ? (
        <EmptyState text="No files in this conversation yet." />
      ) : (
        files.map((file) => (
          <div key={file.name} className="card-item flex items-center gap-3 rounded-xl p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{file.name}</p>
              <p className="text-[11px] text-slate-400">
                {file.pages} page{file.pages === 1 ? "" : "s"} · {file.chunks} chunks · {formatBytes(file.size)}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel() {
  const { meta, connection, provider, setProvider, webSearch, setWebSearch, reconnect } = useChat();

  return (
    <div className="space-y-3 text-sm">
      <div className="card-item rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">Server</span>
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs",
              connection === "online" ? "text-emerald-300" : connection === "offline" ? "text-rose-300" : "text-amber-300",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Connecting"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">{API_URL}</p>
        {connection === "offline" && (
          <button onClick={reconnect} className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>

      <div className="card-item rounded-xl p-3">
        <p className="mb-2 font-semibold text-white">Model routing</p>
        <p className="mb-2 text-xs text-slate-400">
          Your choice is tried first. If it fails, the next available model answers automatically.
        </p>
        <div className="space-y-1.5">
          {[{ id: "auto", label: "Auto (fastest available)", model: "", available: true, healthy: true }, ...(meta?.providers ?? [])].map(
            (p) => (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition",
                  provider === p.id ? "bg-sky-500/20 text-white ring-1 ring-sky-400/40" : "text-slate-300 hover:bg-white/5",
                  !p.available && "cursor-not-allowed opacity-40",
                )}
              >
                <span>
                  {p.label}
                  {p.model && <span className="ml-1 text-slate-400">· {p.model}</span>}
                </span>
                {p.id !== "auto" &&
                  (p.available ? (
                    <span className={cn("h-2 w-2 rounded-full", p.healthy ? "bg-emerald-400" : "bg-amber-400")} />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5 text-slate-500" />
                  ))}
              </button>
            ),
          )}
        </div>
      </div>

      <label className="card-item flex cursor-pointer items-center justify-between rounded-xl p-3">
        <span>
          <span className="block font-semibold text-white">Always search the web</span>
          <span className="text-xs text-slate-400">Ground answers in live results</span>
        </span>
        <input
          type="checkbox"
          checked={webSearch}
          onChange={(e) => setWebSearch(e.target.checked)}
          className="h-4 w-4 accent-sky-500"
        />
      </label>

      {meta && (
        <p className="px-1 text-center text-[11px] text-slate-500">
          {meta.name} · API v{meta.version}
        </p>
      )}
    </div>
  );
}

function EmptyState({ text, spinner = false }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs text-slate-400">
      {spinner && <LoaderCircle className="h-5 w-5 animate-spin text-sky-300" />}
      {text}
    </div>
  );
}

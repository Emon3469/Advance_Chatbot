"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Globe,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Mic,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useOutsideClose } from "@/hooks/useOutsideClose";
import { PROMPTS, type PromptTemplate } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { AgentIcon } from "./AgentIcon";

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechCtor = new () => SpeechRecognizer;

const PROVIDER_STYLE: Record<string, string> = {
  auto: "from-sky-400 to-blue-600",
  openai: "from-emerald-400 to-teal-600",
  anthropic: "from-orange-300 to-amber-600",
  groq: "from-fuchsia-400 to-violet-600",
  groq_backup: "from-pink-400 to-rose-600",
};

const TOOL_NAMES: Record<string, string> = {
  web_search: "Live web search",
  calculator: "Calculator",
  get_stock_price: "Stock quotes",
  purchase_stock: "Simulated stock orders",
  get_current_weather: "Current weather",
  search_documents: "Search your documents",
};

function ProviderPill() {
  const { meta, provider, setProvider } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const options = [
    { id: "auto", label: "Auto", model: "Smart fallback", available: true },
    ...(meta?.providers ?? []).map((p) => ({ id: p.id, label: p.label, model: p.model, available: p.available })),
  ];
  const current = options.find((o) => o.id === provider) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-soft flex h-8 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-medium text-slate-100 transition hover:bg-white/10"
      >
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br", PROVIDER_STYLE[current.id] ?? PROVIDER_STYLE.auto)}>
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </span>
        {current.label}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="popover animate-fade-up absolute bottom-10 left-0 z-40 w-64 rounded-xl p-1.5 shadow-2xl">
          {options.map((o) => (
            <button
              key={o.id}
              disabled={!o.available}
              onClick={() => {
                setProvider(o.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className={cn("h-6 w-6 shrink-0 rounded-full bg-gradient-to-br", PROVIDER_STYLE[o.id] ?? PROVIDER_STYLE.auto)} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">{o.label}</span>
                <span className="block truncate text-[11px] text-slate-400">{o.available ? o.model : "API key not set"}</span>
              </span>
              {provider === o.id && <Check className="h-3.5 w-3.5 text-sky-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentPill() {
  const { meta, agent, setAgent } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const agents = meta?.agents ?? [];
  const current = agents.find((a) => a.id === agent);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-soft flex h-8 max-w-[200px] items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-medium text-slate-100 transition hover:bg-white/10"
      >
        {current ? (
          <AgentIcon icon={current.icon} accent={current.accent} size="sm" />
        ) : (
          <span className="h-6 w-6 rounded-full bg-white/10" />
        )}
        <span className="truncate">{current?.name ?? "Assistant"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="popover animate-fade-up scroll-thin absolute bottom-10 left-0 z-40 max-h-80 w-72 overflow-y-auto rounded-xl p-1.5 shadow-2xl">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setAgent(a.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/10"
            >
              <AgentIcon icon={a.icon} accent={a.accent} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">{a.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{a.description}</span>
              </span>
              {agent === a.id && <Check className="h-3.5 w-3.5 text-sky-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsMenu() {
  const { meta } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 transition",
          open ? "bg-white/10 text-white ring-white/20" : "text-slate-300 ring-white/10 hover:bg-white/5 hover:text-white",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Tools
      </button>
      {open && (
        <div className="popover animate-fade-up absolute bottom-full left-0 z-40 mb-2 w-64 rounded-xl p-3 shadow-2xl">
          <p className="mb-2 text-xs font-semibold text-white">Available tools</p>
          <ul className="space-y-1.5">
            {(meta?.tools ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {TOOL_NAMES[t.id] ?? t.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">The assistant picks the right tool automatically.</p>
        </div>
      )}
    </div>
  );
}

export function Composer({ wide = false }: { wide?: boolean }) {
  const { send, stop, streaming, draft, setDraft, webSearch, setWebSearch, uploadFile, uploading, files, meta, connection, notify } =
    useChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const [listening, setListening] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const slashQuery = draft.startsWith("/") && !draft.includes("\n") ? draft.slice(1).toLowerCase() : null;
  const slashMatches = useMemo<PromptTemplate[]>(
    () =>
      slashQuery === null
        ? []
        : PROMPTS.filter((p) => `${p.title} ${p.category}`.toLowerCase().includes(slashQuery)).slice(0, 6),
    [slashQuery],
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    if (draft && !draft.startsWith("/")) textareaRef.current?.focus();
  }, [draft]);

  useEffect(() => () => recognizerRef.current?.stop(), []);

  const applyPrompt = (prompt: PromptTemplate) => {
    setDraft(prompt.text);
    setSlashIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const submit = () => {
    if (streaming || !draft.trim() || connection !== "online") return;
    const text = draft;
    setDraft("");
    send(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyPrompt(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setDraft("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const toggleMic = () => {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      notify("Voice input is not supported in this browser. Try Chrome or Edge.", "error");
      return;
    }
    const recognizer = new Ctor();
    recognizer.lang = navigator.language || "en-US";
    recognizer.continuous = false;
    recognizer.interimResults = true;
    const base = draft ? `${draft.trimEnd()} ` : "";
    recognizer.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      setDraft(base + text);
    };
    recognizer.onend = () => setListening(false);
    recognizer.onerror = () => setListening(false);
    recognizerRef.current = recognizer;
    recognizer.start();
    setListening(true);
  };

  const accept = (meta?.upload.extensions ?? [".pdf", ".txt", ".md"]).join(",");
  const canSend = !!draft.trim() && connection === "online";

  return (
    <div className={cn("mx-auto w-full", wide ? "max-w-3xl" : "max-w-[540px]")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ProviderPill />
        <AgentPill />
        {files.length > 0 && (
          <span className="flex h-8 items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 text-xs text-cyan-200 ring-1 ring-cyan-400/20">
            <FileText className="h-3.5 w-3.5" />
            {files.length} file{files.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="glass relative rounded-2xl p-3 shadow-2xl shadow-black/30 focus-within:ring-1 focus-within:ring-sky-400/40">
        {slashMatches.length > 0 && (
          <div className="popover animate-fade-up absolute bottom-full left-0 z-40 mb-2 w-full rounded-xl p-1.5 shadow-2xl">
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Commands</p>
            {slashMatches.map((p, i) => (
              <button
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPrompt(p);
                }}
                onMouseEnter={() => setSlashIndex(i)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm",
                  i === slashIndex ? "bg-sky-500/20 text-white" : "text-slate-300",
                )}
              >
                <span>/{p.title.toLowerCase().replace(/\s+/g, "-")}</span>
                <span className="text-[11px] text-slate-400">{p.category}</span>
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          {!draft && (
            <div className="pointer-events-none absolute left-1 top-1.5 flex items-center gap-1.5 text-sm text-slate-300">
              Type
              <kbd className="flex h-5 min-w-5 items-center justify-center rounded-md bg-white/90 px-1 font-sans text-xs font-semibold text-slate-700">
                /
              </kbd>
              for command
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSlashIndex(0);
            }}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Message"
            className="scroll-thin block max-h-[200px] min-h-[40px] w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed text-white focus:outline-none"
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Attach a document"
              aria-label="Attach a document"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-4 w-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
            <ToolsMenu />
            <button
              onClick={() => setWebSearch(!webSearch)}
              aria-pressed={webSearch}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 transition",
                webSearch
                  ? "bg-sky-500/20 text-sky-100 ring-sky-400/40"
                  : "text-slate-300 ring-white/10 hover:bg-white/5 hover:text-white",
              )}
            >
              {webSearch ? <Globe className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
              Search
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl shadow-md transition",
                listening ? "animate-pulse bg-rose-500 text-white" : "bg-white text-slate-700 hover:bg-slate-100",
              )}
            >
              {listening ? <X className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            {streaming ? (
              <button
                onClick={stop}
                aria-label="Stop generating"
                className="btn-primary flex h-9 w-9 items-center justify-center rounded-xl text-white"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                className="btn-primary flex h-9 w-9 items-center justify-center rounded-xl text-white transition disabled:opacity-50 disabled:shadow-none"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

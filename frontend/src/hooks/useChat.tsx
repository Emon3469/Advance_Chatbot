"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, streamEvents, type StreamEvent } from "@/lib/api";
import type {
  ChatMessage,
  ConnectionState,
  DocumentFile,
  Meta,
  Panel,
  Thread,
  ToolCall,
} from "@/lib/types";
import { readStorage, uid, writeStorage } from "@/lib/utils";

interface Notice {
  id: number;
  tone: "info" | "error" | "success";
  text: string;
}

interface ChatContextValue {
  meta: Meta | null;
  connection: ConnectionState;
  threads: Thread[];
  activeId: string;
  messages: ChatMessage[];
  pendingApproval: string | null;
  files: DocumentFile[];
  provider: string;
  agent: string;
  webSearch: boolean;
  streaming: boolean;
  loadingThread: boolean;
  uploading: boolean;
  panel: Panel;
  sidebarOpen: boolean;
  draft: string;
  notice: Notice | null;
  setProvider: (id: string) => void;
  setAgent: (id: string) => void;
  setWebSearch: (value: boolean) => void;
  setPanel: (panel: Panel) => void;
  setSidebarOpen: (open: boolean) => void;
  setDraft: (text: string) => void;
  notify: (text: string, tone?: Notice["tone"]) => void;
  send: (text: string) => Promise<void>;
  resume: (decision: "approve" | "reject") => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => void;
  newChat: () => void;
  selectThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  reconnect: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const PREFS_KEY = "nexio.prefs";
const DEFAULT_PREFS = { provider: "auto", agent: "general", webSearch: false };
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function initialThreadId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("c");
  return fromUrl && ID_RE.test(fromUrl) ? fromUrl : uid();
}

function setUrlThread(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url.toString());
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [prefs] = useState(() => readStorage(PREFS_KEY, DEFAULT_PREFS));
  const [activeId, setActiveId] = useState<string>(initialThreadId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [provider, setProviderState] = useState(prefs.provider);
  const [agent, setAgentState] = useState(prefs.agent);
  const [webSearch, setWebSearchState] = useState(prefs.webSearch);
  const [streaming, setStreaming] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState<Panel>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connectAttempt, setConnectAttempt] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef<string | null>(null);
  const activeRef = useRef(activeId);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const persistPrefs = useCallback(
    (next: Partial<{ provider: string; agent: string; webSearch: boolean }>) => {
      const current = readStorage(PREFS_KEY, DEFAULT_PREFS);
      writeStorage(PREFS_KEY, { ...current, ...next });
    },
    [],
  );

  const setProvider = useCallback(
    (id: string) => {
      setProviderState(id);
      persistPrefs({ provider: id });
    },
    [persistPrefs],
  );

  const setAgent = useCallback(
    (id: string) => {
      setAgentState(id);
      persistPrefs({ agent: id });
    },
    [persistPrefs],
  );

  const setWebSearch = useCallback(
    (value: boolean) => {
      setWebSearchState(value);
      persistPrefs({ webSearch: value });
    },
    [persistPrefs],
  );

  const notify = useCallback((text: string, tone: Notice["tone"] = "info") => {
    const id = Date.now();
    setNotice({ id, text, tone });
    setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 4200);
  }, []);

  const updateMessage = useCallback((id: string, patch: (m: ChatMessage) => ChatMessage) => {
    setMessages((list) => list.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const flush = useCallback(() => {
    frameRef.current = null;
    const target = targetRef.current;
    const chunk = bufferRef.current;
    if (!target || !chunk) return;
    bufferRef.current = "";
    updateMessage(target, (m) => ({ ...m, content: m.content + chunk }));
  }, [updateMessage]);

  const scheduleFlush = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await api.threads());
    } catch {}
  }, []);

  const refreshFiles = useCallback(async (id: string) => {
    try {
      const list = await api.documents(id);
      if (activeRef.current === id) setFiles(list);
    } catch {
      if (activeRef.current === id) setFiles([]);
    }
  }, []);

  const handleEvent = useCallback(
    (event: StreamEvent, assistantId: string) => {
      switch (event.event) {
        case "token":
          bufferRef.current += event.data.content;
          scheduleFlush();
          break;
        case "provider":
          updateMessage(assistantId, (m) => ({ ...m, provider: event.data.label }));
          break;
        case "tool": {
          const tool: ToolCall = event.data;
          updateMessage(assistantId, (m) => {
            const tools = [...(m.tools || [])];
            const index = tools.findIndex((t) => t.id === tool.id);
            if (index >= 0) tools[index] = tool;
            else tools.push(tool);
            return { ...m, tools };
          });
          break;
        }
        case "interrupt":
          setPendingApproval(event.data.message);
          break;
        case "done":
          updateMessage(assistantId, (m) => ({ ...m, firstTokenMs: event.data.first_token_ms }));
          break;
        case "error":
          updateMessage(assistantId, (m) => ({ ...m, error: event.data.message }));
          break;
      }
    },
    [scheduleFlush, updateMessage],
  );

  const runStream = useCallback(
    async (path: string, body: Record<string, unknown>, assistantId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      targetRef.current = assistantId;
      bufferRef.current = "";
      setStreaming(true);

      try {
        await streamEvents(path, body, (event) => handleEvent(event, assistantId), controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          const message =
            error instanceof ApiError
              ? error.message
              : "Could not reach the server. It may be waking up, please try again in a few seconds.";
          updateMessage(assistantId, (m) => ({ ...m, error: message }));
        }
      } finally {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        flush();
        const stopped = controller.signal.aborted;
        updateMessage(assistantId, (m) => ({
          ...m,
          content: stopped && !m.content.trim() && !m.error ? "_Stopped._" : m.content,
          streaming: false,
          tools: m.tools?.map((t) => (t.status === "running" ? { ...t, status: "done" } : t)),
        }));
        targetRef.current = null;
        abortRef.current = null;
        setStreaming(false);
        refreshThreads();
      }
    },
    [flush, handleEvent, refreshThreads, updateMessage],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      const threadId = activeRef.current;
      const assistantId = uid();

      setPendingApproval(null);
      setMessages((list) => [
        ...list.map((m) => ({
          ...m,
          tools: m.tools?.map((t) => (t.status === "waiting" ? { ...t, status: "error" as const } : t)),
        })),
        { id: uid(), role: "user", content: message },
        { id: assistantId, role: "assistant", content: "", tools: [], streaming: true },
      ]);
      setThreads((list) =>
        list.some((t) => t.id === threadId)
          ? list
          : [
              {
                id: threadId,
                title: message.slice(0, 48),
                agent,
                preview: "",
                message_count: 1,
                created_at: Date.now() / 1000,
                updated_at: Date.now() / 1000,
              },
              ...list,
            ],
      );
      setUrlThread(threadId);

      await runStream(
        "/api/chat",
        { thread_id: threadId, message, provider, agent, web_search: webSearch },
        assistantId,
      );
    },
    [agent, provider, runStream, streaming, webSearch],
  );

  const resume = useCallback(
    async (decision: "approve" | "reject") => {
      if (streaming) return;
      const assistantId = uid();
      setPendingApproval(null);
      setMessages((list) => [
        ...list.map((m) => ({
          ...m,
          tools: m.tools?.map((t) =>
            t.status === "waiting" ? { ...t, status: decision === "approve" ? ("done" as const) : ("error" as const) } : t,
          ),
        })),
        { id: assistantId, role: "assistant", content: "", tools: [], streaming: true },
      ]);
      await runStream(
        "/api/chat/resume",
        { thread_id: activeRef.current, decision, provider, agent },
        assistantId,
      );
    },
    [agent, provider, runStream, streaming],
  );

  const regenerate = useCallback(async () => {
    if (streaming) return;
    const index = messages.findLastIndex((m) => m.role === "user");
    if (index < 0) return;
    const content = messages[index].content;
    setMessages((list) => list.slice(0, index));
    await send(content);
  }, [messages, send, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    const id = uid();
    setActiveId(id);
    activeRef.current = id;
    setMessages([]);
    setFiles([]);
    setPendingApproval(null);
    setPanel("chat");
    setSidebarOpen(false);
    setUrlThread(null);
  }, []);

  const selectThread = useCallback(
    async (id: string) => {
      if (id === activeRef.current && messages.length) {
        setSidebarOpen(false);
        return;
      }
      abortRef.current?.abort();
      setActiveId(id);
      activeRef.current = id;
      setMessages([]);
      setFiles([]);
      setPendingApproval(null);
      setLoadingThread(true);
      setSidebarOpen(false);
      setUrlThread(id);
      try {
        const detail = await api.thread(id);
        if (activeRef.current !== id) return;
        setMessages(detail.messages);
        setPendingApproval(detail.pending_approval);
        if (detail.thread?.agent) setAgentState(detail.thread.agent);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not open this conversation", "error");
      } finally {
        if (activeRef.current === id) setLoadingThread(false);
      }
      refreshFiles(id);
    },
    [messages.length, notify, refreshFiles],
  );

  const renameThread = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      setThreads((list) => list.map((t) => (t.id === id ? { ...t, title: clean } : t)));
      try {
        await api.rename(id, clean);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Rename failed", "error");
        refreshThreads();
      }
    },
    [notify, refreshThreads],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      setThreads((list) => list.filter((t) => t.id !== id));
      if (id === activeRef.current) newChat();
      try {
        await api.remove(id);
        notify("Conversation deleted", "success");
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) {
          notify(error instanceof Error ? error.message : "Delete failed", "error");
          refreshThreads();
        }
      }
    },
    [newChat, notify, refreshThreads],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const limit = meta?.upload.max_mb ?? 15;
      if (file.size > limit * 1024 * 1024) {
        notify(`File is larger than ${limit} MB`, "error");
        return;
      }
      const id = activeRef.current;
      setUploading(true);
      try {
        const record = await api.upload(id, file);
        if (activeRef.current === id) {
          setFiles((list) => [...list.filter((f) => f.name !== record.name), record]);
        }
        setUrlThread(id);
        notify(`${record.name} is ready. Ask anything about it.`, "success");
        refreshThreads();
      } catch (error) {
        notify(error instanceof Error ? error.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [meta, notify, refreshThreads],
  );

  const reconnect = useCallback(() => setConnectAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    const loadInitial = async () => {
      refreshThreads();
      const id = activeRef.current;
      const fromUrl = new URLSearchParams(window.location.search).get("c");
      if (!fromUrl || fromUrl !== id) return;
      refreshFiles(id);
      setLoadingThread(true);
      try {
        const detail = await api.thread(id);
        if (cancelled || activeRef.current !== id) return;
        setMessages((current) => (current.length ? current : detail.messages));
        setPendingApproval(detail.pending_approval);
        if (detail.thread?.agent) setAgentState(detail.thread.agent);
      } catch {
      } finally {
        setLoadingThread(false);
      }
    };

    const connect = async () => {
      setConnection("connecting");
      while (!cancelled) {
        try {
          const data = await api.meta(10000);
          if (cancelled) return;
          setMeta(data);
          setConnection("online");
          await loadInitial();
          return;
        } catch {
          if (cancelled) return;
          if (Date.now() - started > 120000) {
            setConnection("offline");
            return;
          }
          setConnection("waking");
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    };

    const timer = setTimeout(connect, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connectAttempt, refreshFiles, refreshThreads]);

  const value = useMemo<ChatContextValue>(
    () => ({
      meta,
      connection,
      threads,
      activeId,
      messages,
      pendingApproval,
      files,
      provider,
      agent,
      webSearch,
      streaming,
      loadingThread,
      uploading,
      panel,
      sidebarOpen,
      draft,
      notice,
      setProvider,
      setAgent,
      setWebSearch,
      setPanel,
      setSidebarOpen,
      setDraft,
      notify,
      send,
      resume,
      regenerate,
      stop,
      newChat,
      selectThread,
      renameThread,
      deleteThread,
      uploadFile,
      reconnect,
    }),
    [
      meta,
      connection,
      threads,
      activeId,
      messages,
      pendingApproval,
      files,
      provider,
      agent,
      webSearch,
      streaming,
      loadingThread,
      uploading,
      panel,
      sidebarOpen,
      draft,
      notice,
      setProvider,
      setAgent,
      setWebSearch,
      notify,
      send,
      resume,
      regenerate,
      stop,
      newChat,
      selectThread,
      renameThread,
      deleteThread,
      uploadFile,
      reconnect,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used inside ChatProvider");
  return context;
}

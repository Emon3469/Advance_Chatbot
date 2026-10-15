import type { DocumentFile, Meta, Thread, ThreadDetail, ToolStatus } from "./types";
import { readStorage, uid, writeStorage } from "./utils";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

const CLIENT_KEY = "nexio.client-id";

export function clientId(): string {
  if (typeof window === "undefined") return "anonymous";
  let id = readStorage<string | null>(CLIENT_KEY, null);
  if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    id = uid();
    writeStorage(CLIENT_KEY, id);
  }
  return id;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.detail) return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {}
  return res.statusText || `Request failed (${res.status})`;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: { "X-Client-Id": clientId(), ...(init.headers || {}) },
    });
    if (!res.ok) throw new ApiError(await readError(res), res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

export const api = {
  meta: (timeoutMs?: number) => request<Meta>("/api/meta", {}, timeoutMs),
  threads: () => request<Thread[]>("/api/threads"),
  thread: (id: string) => request<ThreadDetail>(`/api/threads/${id}/messages`),
  rename: (id: string, title: string) =>
    request<{ ok: boolean }>(`/api/threads/${id}`, { method: "PATCH", ...json({ title }) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/threads/${id}`, { method: "DELETE" }),
  documents: (id: string) => request<DocumentFile[]>(`/api/threads/${id}/documents`),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentFile>(`/api/threads/${id}/documents`, { method: "POST", body: form }, 120000);
  },
};

export type StreamEvent =
  | { event: "start"; data: { thread_id: string; title: string } }
  | { event: "provider"; data: { id: string; label: string; model?: string } }
  | { event: "token"; data: { content: string } }
  | { event: "tool"; data: { id: string; name: string; label: string; status: ToolStatus } }
  | { event: "interrupt"; data: { message: string } }
  | {
      event: "done";
      data: {
        thread_id: string;
        provider: string | null;
        first_token_ms: number | null;
        total_ms: number;
        awaiting_approval: boolean;
      };
    }
  | { event: "error"; data: { message: string } };

export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Client-Id": clientId(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) throw new ApiError(await readError(res), res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let name = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }
      onEvent({ event: name, data: parsed } as StreamEvent);
    }
  }
}

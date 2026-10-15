export type Role = "user" | "assistant";

export type ToolStatus = "running" | "done" | "error" | "waiting";

export interface ToolCall {
  id?: string;
  name: string;
  label: string;
  status: ToolStatus;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  tools?: ToolCall[];
  provider?: string | null;
  streaming?: boolean;
  error?: string;
  firstTokenMs?: number | null;
}

export interface Thread {
  id: string;
  title: string;
  agent: string;
  preview: string;
  message_count: number;
  created_at: number;
  updated_at: number;
}

export interface Provider {
  id: string;
  label: string;
  model: string;
  available: boolean;
  healthy: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  starters: string[];
}

export interface ToolInfo {
  id: string;
  label: string;
}

export interface Meta {
  name: string;
  version: string;
  providers: Provider[];
  agents: Agent[];
  tools: ToolInfo[];
  upload: { max_mb: number; extensions: string[] };
}

export interface DocumentFile {
  name: string;
  pages: number;
  chunks: number;
  size: number;
  uploaded_at: number;
}

export interface ThreadDetail {
  thread: Thread | null;
  messages: ChatMessage[];
  pending_approval: string | null;
}

export type Panel = "chat" | "prompts" | "agents" | "files" | "settings";

export type ConnectionState = "connecting" | "waking" | "online" | "offline";

import { streamInbox } from "./inbox-stream.ts";
/**
 * Thin HTTP client for the P0 Go controller.
 * Registry and pure-text messaging; no task or spawn APIs.
 */

export type AgentStatus = "online" | "offline";

export type AgentRecord = {
  agent_id: string;
  cwd?: string;
  runtime_id?: string;
  role_description?: string;
  role: string;
  squad_id: string;
  runtime_type: string;
  herdr_session_id?: string;
  space_id?: string;
  pane_id?: string;
  runtime_session_id?: string;
  status: AgentStatus;
  last_seen: string;
};

export type RegisterPayload = {
  runtime_token?: string;
  previous_session_id?: string;
  agent_id: string;
  cwd?: string;
  runtime_id?: string;
  role_description?: string;
  role: string;
  squad_id: string;
  runtime_type: string;
  herdr_session_id?: string;
  space_id?: string;
  pane_id?: string;
  runtime_session_id?: string;
};

export type ListAgentsQuery = {
  agent_id?: string;
  role?: string;
  squad_id?: string;
  status?: AgentStatus;
};

export class ControllerError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`controller HTTP ${status}: ${body}`);
    this.name = "ControllerError";
    this.status = status;
    this.body = body;
  }
}

export function createControllerClient(baseUrl: string) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${root}${path}`, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ControllerError(res.status, text);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  return {
    streamInbox(binding: Binding, signal: AbortSignal, onWake: () => void, onConnected: () => void): Promise<void> {
      return streamInbox(root, binding, signal, onWake, onConnected);
    },
    sendMessage(payload: MessagePayload, signal?: AbortSignal): Promise<SquadMessage> {
      return request("/messages/send", { method: "POST", body: JSON.stringify(payload), signal });
    },
    inbox(binding: Binding, signal?: AbortSignal, pendingOnly = false): Promise<{ messages: SquadMessage[] }> {
      return request("/messages/inbox", { method: "POST", body: JSON.stringify({ ...binding, pending_only: pendingOnly }), signal });
    },
    getMessage(binding: Binding, messageId: string, signal?: AbortSignal): Promise<SquadMessage> {
      return request("/messages/get", { method: "POST", body: JSON.stringify({ ...binding, message_id: messageId }), signal });
    },
    receipt(binding: Binding, messageId: string, status: string): Promise<SquadMessage> {
      return request("/messages/receipt", { method: "POST", body: JSON.stringify({ ...binding, message_id: messageId, status }) });
    },
    register(payload: RegisterPayload): Promise<AgentRecord> {
      return request<AgentRecord>("/agents/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    heartbeat(agentId: string, runtimeSessionId?: string, runtimeId?: string, runtimeToken?: string): Promise<AgentRecord> {
      return request<AgentRecord>("/agents/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId, runtime_id: runtimeId, runtime_token: runtimeToken,
          ...(runtimeSessionId ? { runtime_session_id: runtimeSessionId } : {}),
        }),
      });
    },

    listAgents(query: ListAgentsQuery = {}): Promise<AgentRecord[]> {
      const params = new URLSearchParams();
      if (query.agent_id) params.set("agent_id", query.agent_id);
      if (query.role) params.set("role", query.role);
      if (query.squad_id) params.set("squad_id", query.squad_id);
      if (query.status) params.set("status", query.status);
      const qs = params.toString();
      return request<{ agents: AgentRecord[] }>(`/agents${qs ? `?${qs}` : ""}`).then(
        (body) => body.agents ?? [],
      );
    },

    async getAgent(agentId: string, signal?: AbortSignal): Promise<AgentRecord> {
      const id = agentId.trim();
      if (!id) throw new Error("agent_id must not be empty");
      // Dot segments are normalized by fetch; encoded slashes may be decoded by
      // HTTP routers. Preserve exact lookup for those IDs using the list filter.
      if (id === "." || id === ".." || id.includes("/")) {
        const body = await request<{ agents: AgentRecord[] }>(`/agents?${new URLSearchParams({ agent_id: id })}`, { signal });
        const agent = body.agents.find(item => item.agent_id === id);
        if (!agent) throw new ControllerError(404, "agent not found");
        return agent;
      }
      return request<AgentRecord>(`/agents/${encodeURIComponent(id)}`, { signal });
    },
  };
}

export type ControllerClient = ReturnType<typeof createControllerClient>;

export type Binding = { agent_id: string; runtime_id: string; runtime_session_id: string; runtime_token?: string };
export type SquadMessage = {
  message_id: string; request_id: string; from: Binding; to: Binding;
  kind: "notice" | "ask" | "reply"; text: string; reply_to?: string;
  created_at: string; expires_at: string; status: string;
};
export type MessagePayload = Binding & {
  request_id: string; to_agent_id: string; target_runtime_id: string; target_session_id: string;
  kind: "notice" | "ask" | "reply"; text: string; reply_to?: string;
};

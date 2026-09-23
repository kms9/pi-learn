/**
 * Thin HTTP client for the P0 Go controller.
 * No messaging, task, or spawn APIs.
 */

export type AgentStatus = "online" | "offline";

export type AgentRecord = {
  agent_id: string;
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
  agent_id: string;
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
    register(payload: RegisterPayload): Promise<AgentRecord> {
      return request<AgentRecord>("/agents/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    heartbeat(agentId: string, runtimeSessionId?: string): Promise<AgentRecord> {
      return request<AgentRecord>("/agents/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
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

    getAgent(agentId: string): Promise<AgentRecord> {
      return request<AgentRecord>(`/agents/${encodeURIComponent(agentId)}`);
    },
  };
}

export type ControllerClient = ReturnType<typeof createControllerClient>;

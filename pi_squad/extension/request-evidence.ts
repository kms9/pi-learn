import { getCurrentSystemMessage, getCurrentTools } from "@earendil-works/pi-ai";
import { hash, type ProjectIdentity } from "./project.ts";
import { sections } from "./context-assembly.ts";
import { taskTools } from "./control-tools.ts";
import type { Dispatch } from "./protocol.ts";

const fields = ["role_id", "team_id", "run_id", "task_id", "attempt_id", "segment_id", "role_hash", "working_hash", "config_hash"] as const;
type Identity = Record<string, string | number | null>;
export type ContextEvidence = {
  request_seq: number;
  identity: Identity;
  section_hashes: Record<string, string>;
  tools: string[];
  api?: string;
  provider?: string;
};
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sorted = (values: string[]) => [...new Set(values)].sort();
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const hashesEqual = (a: Record<string, string>, b: Record<string, string>) => equal(Object.entries(a).sort(), Object.entries(b).sort());
export function contextIdentity(task: unknown): Identity {
  const value = obj(task);
  return Object.fromEntries(fields.map((key) => {
    const v = value[key];
    return [key, typeof v === "number" && Number.isFinite(v) || typeof v === "string" && v.length <= 256 ? v : null];
  }));
}
function identityFromXML(xml: string | undefined): Identity {
  const content = xml?.match(/^<pi_squad_task>\n([\s\S]*)\n<\/pi_squad_task>$/)?.[1];
  try { return contextIdentity(content ? JSON.parse(content) : {}); }
  catch { return contextIdentity({}); }
}
export function expectedContext(raw: Record<string, string>, tools: string[], requestSeq: number): ContextEvidence {
  const wrapped = Object.fromEntries(Object.entries(raw).filter(([name, text]) => name.startsWith("pi_squad_") && text.length > 0).map(([name, text]) => [name, `<${name}>\n${text}\n</${name}>`]));
  return {
    request_seq: requestSeq, identity: identityFromXML(wrapped.pi_squad_task),
    section_hashes: Object.fromEntries(Object.entries(wrapped).map(([name, text]) => [name, hash(text)])),
    tools: sorted(tools),
  };
}
export function dispatchContext(identity: ProjectIdentity, dispatch: Dispatch | undefined, activeTools: string[], requestSeq: number) {
  return expectedContext(sections(identity, dispatch), dispatch ? taskTools(dispatch) : activeTools, requestSeq);
}
export function canonicalEvidence(messages: readonly { role: string }[], expected: ContextEvidence, activeTools: string[], scope: "squad_hook" | "last_observer", model?: { api: string; provider: string }) {
  const system = getCurrentSystemMessage(messages);
  const own = Object.fromEntries(Object.entries(system?.sections ?? {}).filter(([name, text]) => name.startsWith("pi_squad_") && typeof text === "string"));
  const current: ContextEvidence = {
    request_seq: expected.request_seq, identity: identityFromXML(own.pi_squad_task ?? undefined),
    section_hashes: Object.fromEntries(Object.entries(own).map(([name, text]) => [name, hash(text!)])),
    tools: sorted(getCurrentTools(messages).map((tool) => tool.name)),
  };
  const formal = typeof expected.identity.task_id === "string" && typeof expected.identity.attempt_id === "string" && Number(expected.identity.segment_id) > 0;
  const toolsMatch = equal(current.tools, expected.tools) && equal(current.tools, sorted(activeTools));
  const contextMatch = equal(current.identity, expected.identity) && hashesEqual(current.section_hashes, expected.section_hashes);
  return { ...current, api: model?.api ?? "unknown", provider: model?.provider ?? "unknown", observation_scope: scope, status: formal ? contextMatch && toolsMatch ? "match" : "mismatch" : "unknown", context_match: contextMatch, tools_match: toolsMatch };
}

/** Replay Pi 1.0.1's XML sections and its named removal framing in wire order. */
function applyText(text: string, own: Map<string, string>): void {
  const pattern = /<(pi_squad_[a-z_]+)>\n[\s\S]*?\n<\/\1>|Removed system prompt section "(pi_squad_[a-z_]+)"\./g;
  for (const match of text.matchAll(pattern)) {
    if (match[2]) own.delete(match[2]);
    else own.set(match[1], match[0]);
  }
}
function textParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) throw new Error("SYSTEM_CONTENT_UNSUPPORTED");
  return value.flatMap((raw) => {
    const part = obj(raw);
    if (["text", "input_text"].includes(String(part.type)) && typeof part.text === "string") return [part.text];
    if (["tool_addition", "tool_removal"].includes(String(part.type))) return [];
    throw new Error("SYSTEM_BLOCK_UNSUPPORTED");
  });
}
const ccNames = new Set(["Read", "Write", "Edit", "Bash", "Grep", "Glob", "AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "KillShell", "NotebookEdit", "Skill", "Task", "TaskOutput", "TodoWrite", "WebFetch", "WebSearch"]);
function decodeRequest(payload: unknown, canonical: ContextEvidence) {
  const p = obj(payload);
  const own = new Map<string, string>();
  const tools = new Set<string>();
  const anthropic = p.system !== undefined;
  const normalizeName = (name: string) => anthropic && ccNames.has(name) && canonical.tools.includes(name.toLowerCase()) ? name.toLowerCase() : name;
  const addTools = (value: unknown) => {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 512) throw new Error("TOOLS_UNSUPPORTED");
    for (const raw of value) {
      const t = obj(raw);
      if (Array.isArray(t.functionDeclarations)) { addTools(t.functionDeclarations); continue; }
      // Provider search containers are not model-callable Squad tools. Their
      // loaded definitions are only recognized in explicit additional_tools.
      if (["tool_search", "tool_search_regex", "tool_search_bm25"].includes(String(t.type))) throw new Error("TOOL_SEARCH_UNSUPPORTED");
      const name = t.name ?? obj(t.function).name;
      if (typeof name !== "string" || !name || name.length > 256) throw new Error("TOOL_DEFINITION_UNSUPPORTED");
      tools.add(normalizeName(name));
    }
  };
  const applySystem = (content: unknown) => {
    for (const text of textParts(content)) applyText(text, own);
    if (Array.isArray(content)) for (const raw of content) {
      const part = obj(raw);
      if (part.type === "tool_removal") {
        const reference = obj(part.tool);
        if (reference.type !== "tool_reference" || typeof reference.name !== "string") throw new Error("TOOL_REMOVAL_UNSUPPORTED");
        tools.delete(normalizeName(reference.name));
      } else if (part.type === "tool_addition") {
        const tool = obj(part.tool);
        if (tool.type !== "tool_definition") throw new Error("TOOL_ADDITION_UNSUPPORTED");
        addTools([tool.definition]);
      }
    }
  };
  let format: string;
  if (Array.isArray(p.contents) && (p.config !== undefined || p.systemInstruction !== undefined)) {
    if (!["google-generative-ai", "google-vertex"].includes(canonical.api ?? "")) throw new Error("REQUEST_API_MISMATCH");
    format = "gemini";
    const config = p.config === undefined ? p : obj(p.config);
    const system = config.systemInstruction;
    if (typeof system === "string") applySystem(system);
    else if (system !== undefined) applySystem(obj(system).parts);
    addTools(config.tools);
  } else if (Array.isArray(p.input)) {
    if (!["openai-responses", "openai-codex-responses", "azure-openai-responses"].includes(canonical.api ?? "")) throw new Error("REQUEST_API_MISMATCH");
    format = "openai-responses";
    if (p.previous_response_id !== undefined) throw new Error("STATEFUL_REQUEST_PREFIX_UNOBSERVED");
    if (p.instructions !== undefined) applySystem(p.instructions);
    addTools(p.tools);
    for (const raw of p.input) {
      const item = obj(raw);
      if (item.type === "additional_tools" && item.role === "developer") addTools(item.tools);
      else if (["tool_search_output", "tool_search_call"].includes(String(item.type))) throw new Error("TOOL_SEARCH_UNSUPPORTED");
      else if (["system", "developer"].includes(String(item.role))) applySystem(item.content);
    }
  } else if (Array.isArray(p.messages)) {
    if (anthropic ? canonical.api !== "anthropic-messages" : canonical.api !== "openai-completions") throw new Error("REQUEST_API_MISMATCH");
    format = anthropic ? "anthropic" : "openai-chat";
    if (p.system !== undefined) applySystem(p.system);
    addTools(p.tools);
    for (const raw of p.messages) {
      const message = obj(raw);
      if (!["system", "developer"].includes(String(message.role))) continue;
      if (message.content !== undefined) applySystem(message.content);
      if (message.tools !== undefined && canonical.provider !== "kimi-coding") throw new Error("INLINE_TOOLS_UNSUPPORTED");
      addTools(message.tools);
    }
  } else throw new Error("REQUEST_FORMAT_UNSUPPORTED");
  return { format, identity: identityFromXML(own.get("pi_squad_task")), section_hashes: Object.fromEntries([...own].map(([name, text]) => [name, hash(text)])), tools: sorted([...tools]) };
}

/** No raw payload or prompt body escapes this function. Unknown never means pass. */
export function providerEvidence(payload: unknown, canonical: ReturnType<typeof canonicalEvidence> | undefined, scope: "squad_hook" | "last_observer") {
  let digest = "unknown";
  let bytes = 0;
  const base = { request_seq: canonical?.request_seq ?? 0, observation_scope: scope };
  try {
    const raw = JSON.stringify(payload);
    if (!raw || Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error("REQUEST_OVERSIZED_OR_MISSING");
    digest = hash(raw); bytes = Buffer.byteLength(raw);
    if (!canonical || canonical.status === "unknown") throw new Error("CANONICAL_CONTEXT_UNAVAILABLE");
    const effective = decodeRequest(payload, canonical);
    const contextMatch = equal(effective.identity, canonical.identity) && hashesEqual(effective.section_hashes, canonical.section_hashes);
    const toolsMatch = equal(effective.tools, canonical.tools);
    return { ...base, ...effective, sha256: digest, bytes, status: canonical.status === "match" && contextMatch && toolsMatch ? "match" : "mismatch", context_match: contextMatch, tools_match: toolsMatch };
  } catch (error) {
    // All decode errors are fixed structural codes, never payload values.
    const reason = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "REQUEST_DECODE_FAILED";
    return { ...base, sha256: digest, bytes, status: "unknown", reason };
  }
}

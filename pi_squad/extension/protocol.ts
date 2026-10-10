export type Binding = {
  agent_id: string;
  runtime_id: string;
  session_id: string;
  binding_epoch: number;
  primary_epoch: number;
};
export type TaskContract = {
  task_id: string;
  scope: "team" | "standalone";
  team_id: string | null;
  run_id: string | null;
  role_id: string;
  kind: string;
  goal: string;
  goal_revision: number;
  applied_revision: number;
  revision: number;
  state: string;
  accepted: boolean;
  root_id: string;
  parent_id?: string;
  expected_target: Binding | null;
  allowed_tools: string[];
  write_set: string[];
  deadline_at: string;
  dependencies: { task_id: string; condition: string }[];
  refs: unknown[];
  expected_output: unknown;
  acceptance_policy: unknown;
  attempt_ids: string[];
  blockers: unknown[];
};
export type Attempt = {
  segment_mode?: string;
  clarification_id?: string;
  clarification_text?: string;
  attempt_id: string;
  task_id: string;
  attempt_no: number;
  state: string;
  cleanup_state: string;
  target: Binding;
  segment_id: number;
  controller_epoch: number;
  fencing_token: number;
  lease_expires_at: string;
  receipt: string;
  revision: number;
  context: {
    role: {
      body: string;
      working_rules: string;
      hash: string;
      working_hash: string;
    };
    team_instructions: string;
    config_hash: string;
    allowed_tools: string[];
    write_set: string[];
  };
  error?: string;
};
export type Dispatch = {
  briefing?: unknown;
  attempt: Attempt;
  task: TaskContract;
  protocol_version: string;
};
export type Instance = {
  binding: Binding;
  mode: string;
  role_id?: string;
  team_id?: string;
  activity: string;
  capabilities: Record<string, boolean>;
};
export type Snapshot = {
  revision: number;
  controller_epoch: number;
  observed_at: string;
  state: string;
  views: Record<string, Record<string, unknown>[]>;
};

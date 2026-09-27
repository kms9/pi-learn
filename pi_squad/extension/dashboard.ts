import { randomUUID } from "node:crypto";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Invocation } from "./invocation.ts";
import type { Snapshot } from "./protocol.ts";

type Selection = {
  view: string;
  row: Record<string, unknown>;
  snapshot: Snapshot;
  assertCurrent: () => void;
};
const views = [
  "runs",
  "teams",
  "roles",
  "leaders",
  "agents",
  "tasks",
  "attempts",
  "events",
  "waits",
  "capacity",
  "evidence",
];
const label = (row: Record<string, unknown>) =>
  String(
    row.task_id ??
      row.run_id ??
      row.role_id ??
      row.team_id ??
      (row.config as { team_id?: string })?.team_id ??
      row.attempt_id ??
      (row.binding as { agent_id?: string })?.agent_id ??
      row.waiter ??
      row.seq ??
      "?",
  );

/** Native observer. Closing it only disposes its own refresh timer. */
export async function openDashboard(
  runtime: Invocation,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const selected = await ctx.ui.custom<Selection | undefined>(
    (tui, _theme, _keys, done) => {
      let snapshot: Snapshot | undefined,
        stale = "loading",
        alive = true,
        fetching = false,
        generation = 0,
        request: AbortController | undefined,
        view = 0,
        index = 0,
        offset = 0,
        detail = false,
        filter = "",
        filtering = false;
      let snapshotFence: (() => void) | undefined;
      const rows = () =>
        snapshot?.views[views[view]]?.filter((row) =>
          JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()),
        ) ?? [];
      const refresh = async () => {
        if (fetching || !alive) return;
        fetching = true;
        const current = generation;
        request = new AbortController();
        try {
          // Read-only rediscovery refreshes observation; it never resumes work.
          if (stale && stale !== "loading") await runtime.client.connect();
          if (!alive || current !== generation) return;
          const next = await runtime.client.snapshot(request.signal);
          if (!alive || current !== generation) return;
          if (snapshot && next.controller_epoch !== snapshot.controller_epoch) {
            snapshot = undefined;
            index = 0;
            offset = 0;
          }
          if (!snapshot || next.revision >= snapshot.revision) {
            snapshot = next;
            snapshotFence = runtime.client.captureControllerFence();
            stale = "";
            index = Math.min(index, Math.max(0, rows().length - 1));
          }
        } catch (error) {
          if (alive && current === generation) stale = String(error);
        } finally {
          if (current === generation) {
            fetching = false;
            if (alive) tui.requestRender();
          }
        }
      };
      const timer = setInterval(() => void refresh(), 2000);
      void refresh();
      return {
        invalidate() {},
        dispose() {
          alive = false;
          generation++;
          request?.abort();
          clearInterval(timer);
        },
        handleInput(data: string) {
          if (filtering) {
            if (matchesKey(data, "enter") || matchesKey(data, "escape"))
              filtering = false;
            else if (matchesKey(data, "backspace"))
              filter = Array.from(filter).slice(0, -1).join("");
            else if (!/[\x00-\x1f]/.test(data)) filter += data;
            index = 0;
            tui.requestRender();
            return;
          }
          if (data === "q" || matchesKey(data, "escape")) {
            done(undefined);
            return;
          }
          if (matchesKey(data, "tab")) {
            view = (view + 1) % views.length;
            index = 0;
            offset = 0;
            detail = false;
          }
          if (data === "/ ".trim()) {
            filtering = true;
          }
          if (matchesKey(data, "enter")) {
            detail = !detail;
            offset = 0;
          }
          if (data === "j" || matchesKey(data, "down")) {
            if (detail) offset++;
            else index = Math.min(index + 1, rows().length - 1);
          }
          if (data === "k" || matchesKey(data, "up")) {
            if (detail) offset = Math.max(0, offset - 1);
            else index = Math.max(0, index - 1);
          }
          if (data === "r") {
            const current = ++generation;
            request?.abort();
            fetching = true;
            stale = "rediscovering";
            void runtime.client
              .connect()
              .then(() => {
                if (!alive || current !== generation) return;
                snapshot = undefined;
                fetching = false;
                return refresh();
              })
              .catch((error) => {
                if (!alive || current !== generation) return;
                fetching = false;
                stale = String(error);
                tui.requestRender();
              });
          }
          if (data === "p" && snapshot && !stale && rows()[index]) {
            const executionFence = runtime.captureExecutionFence();
            const controllerFence = snapshotFence!;
            done({ view: views[view], row: rows()[index], snapshot,
              assertCurrent: () => { executionFence(); controllerFence(); },
            });
            return;
          }
          tui.requestRender();
        },
        render(width: number) {
          const clip = (line: string) =>
            truncateToWidth(line, Math.max(1, width));
          const age = snapshot
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - Date.parse(snapshot.observed_at)) / 1000,
                ),
              )
            : 0;
          const result = [
            `Pi Squad · epoch ${snapshot?.controller_epoch ?? "?"} revision ${snapshot?.revision ?? "?"} age ${age}s ${stale ? "STALE " + stale : "current"}`,
            views.map((v, i) => (i === view ? `[${v}]` : v)).join(" "),
            `filter${filtering ? " (editing)" : ""}: ${filter}`,
          ];
          const data = rows();
          if (detail && data[index]) {
            const lines = JSON.stringify(data[index], null, 2).split("\n");
            offset = Math.min(offset, Math.max(0, lines.length - 15));
            result.push(...lines.slice(offset, offset + 15));
          } else {
            const start = Math.max(0, index - 14);
            result.push(
              ...data
                .slice(start, start + 15)
                .map(
                  (row, i) =>
                    `${start + i === index ? ">" : " "} ${label(row)} · ${String(row.phase ?? row.state ?? row.presence ?? "")} ${JSON.stringify(row.blockers ?? row.acceptance ?? "")}`,
                ),
            );
          }
          result.push(
            "tab view · / filter · ↑↓ select/scroll · enter detail · r refresh · p action preview · q close",
          );
          return result.map(clip);
        },
      };
    },
  );
  if (!selected) return;
  const { row, view, snapshot, assertCurrent } = selected;
  let route: string;
  let operation: string;
  const q: Record<string, unknown> = {
    request_id: randomUUID(),
    expected_revision: row.revision,
  };
  if (view === "runs") {
    operation = "cancel";
    route = `/v2/runs/${encodeURIComponent(String(row.run_id))}/cancel`;
  } else if (view === "tasks") {
    const choice = await ctx.ui.select("预览任务操作", ["cancel", "recover"]);
    if (!choice) return;
    operation = choice;
    route = `/v2/tasks/${encodeURIComponent(String(row.task_id))}/${choice}`;
    if (choice === "recover") {
      const evidence = await ctx.ui.input(
        "已有证据引用",
        "attempt:<id> 或 evidence:<seq>",
      );
      if (!evidence) return;
      q.evidence = evidence;
    }
  } else if (view === "roles" || view === "leaders") {
    const choice = view === "roles"
      ? await ctx.ui.select("预览角色操作", ["promote", "release"])
      : "release";
    if (!choice) return;
    operation = choice;
    route = view === "roles"
      ? `/v2/roles/${encodeURIComponent(String(row.role_id))}/${choice}`
      : `/v2/teams/${encodeURIComponent(String(row.team_id))}/leader/release`;
    if (choice === "promote") {
      const target = await ctx.ui.select(
        "选择现有 Secondary",
        (row.secondary_agent_ids as string[]) ?? [],
      );
      if (!target) return;
      q.agent_id = target;
    }
    const ownerID = row.primary_agent_id ?? row.agent_id;
    const owner = snapshot.views.agents.find(
      (a) => (a.binding as { agent_id?: string })?.agent_id === ownerID,
    );
    q.expected_runtime =
      (owner?.binding as { runtime_id?: string } | undefined)?.runtime_id ??
      (view === "leaders" ? row.runtime_id : "") ?? "";
  } else {
    ctx.ui.notify("此视图只读；管理入口在 runs、tasks、roles、leaders。", "info");
    return;
  }
  const note = await ctx.ui.input("操作原因与副作用处理说明");
  if (!note) return;
  q.note = note;
  const submit = await ctx.ui.select(
    `预览（尚未写入）\nPOST ${route}\n${JSON.stringify(q, null, 2)}`,
    ["返回，不提交", `显式提交 ${operation}`],
  );
  if (submit !== `显式提交 ${operation}`) return;
  try {
    assertCurrent();
    const result = await runtime.client.request(route, q, true);
    ctx.ui.notify(
      `操作已提交：${JSON.stringify(result).slice(0, 4000)}`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify(`提交失败，未假定成功：${String(error)}`, "error");
  }
}

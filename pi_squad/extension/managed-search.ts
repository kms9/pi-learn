import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  createGrepToolDefinition,
  createFindToolDefinition,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { Invocation } from "./invocation.ts";
import { within } from "./project.ts";

const exec = promisify(execFile);
export function installManagedSearch(runtime: Invocation): void {
  const guard = (name: string, target?: string) => {
    const absolute = realpathSync(
      path.resolve(runtime.identity.root, target || "."),
    );
    if (
      within(
        path.join(runtime.identity.root, ".agents/pisquad/.runtime"),
        absolute,
      )
    )
      throw new Error("CONTROL_PATH_DENIED");
    const reason = runtime.gate.checkTool(name, { path: absolute });
    if (reason) throw new Error(reason);
    return absolute;
  };
  const result = (text: string) => {
    const truncation = truncateHead(text);
    return {
      content: [
        { type: "text" as const, text: truncation.content || "No matches" },
      ],
      details: { truncation },
    };
  };
  const grep = createGrepToolDefinition(runtime.identity.root);
  runtime.pi.registerTool({
    ...grep,
    async execute(_id, params, signal) {
      const checkCurrent = runtime.captureExecutionFence();
      const target = guard("grep", params.path);
      const args = [
        "--json",
        "--line-number",
        "--color=never",
        "--hidden",
        "--max-count",
        String(Math.min(params.limit ?? 100, 1000)),
      ];
      if (params.ignoreCase) args.push("--ignore-case");
      if (params.literal) args.push("--fixed-strings");
      if (params.context)
        args.push("--context", String(Math.min(params.context, 10)));
      if (params.glob) args.push("--glob", params.glob);
      args.push(
        "--glob",
        "!**/.agents/**",
        "--glob",
        "!**/.git/**",
        "--",
        params.pattern,
        target,
      );
      try {
        const output = await exec("rg", args, {
          signal,
          maxBuffer: 1024 * 1024,
        });
        checkCurrent();
        const lines: string[] = [];
        for (const raw of output.stdout.split("\n")) {
          if (!raw) continue;
          const item = JSON.parse(raw) as {
            type: string;
            data?: {
              path?: { text?: string };
              lines?: { text?: string };
              line_number?: number;
            };
          };
          if (
            !["match", "context"].includes(item.type) ||
            !item.data?.path?.text
          )
            continue;
          try {
            guard("grep", item.data.path.text);
          } catch {
            continue;
          }
          lines.push(
            `${path.relative(runtime.identity.root, item.data.path.text)}:${item.data.line_number}: ${item.data.lines?.text ?? ""}`,
          );
          if (lines.length >= Math.min(params.limit ?? 100, 1000)) break;
        }
        return result(lines.join("\n"));
      } catch (error) {
        checkCurrent();
        if ((error as { code?: number }).code === 1) return result("");
        throw new Error(
          "GREP_FAILED: search failed or exceeded bounded output; narrow the query",
        );
      }
    },
  });
  const find = createFindToolDefinition(runtime.identity.root);
  runtime.pi.registerTool({
    ...find,
    async execute(_id, params, signal) {
      const checkCurrent = runtime.captureExecutionFence();
      const target = guard("find", params.path);
      try {
        const output = await exec(
          "rg",
          [
            "--files",
            "--hidden",
            "--glob",
            params.pattern,
            "--glob",
            "!**/.agents/**",
            "--glob",
            "!**/.git/**",
            "--",
            target,
          ],
          { signal, maxBuffer: 1024 * 1024 },
        );
        checkCurrent();
        return result(
          output.stdout
            .split("\n")
            .filter((file) => {
              if (!file) return false;
              try {
                guard("find", file);
                return true;
              } catch {
                return false;
              }
            })
            .slice(0, Math.min(params.limit ?? 100, 1000))
            .join("\n"),
        );
      } catch (error) {
        checkCurrent();
        if ((error as { code?: number }).code === 1) return result("");
        throw new Error(
          "FIND_FAILED: search failed or exceeded bounded output",
        );
      }
    },
  });
}

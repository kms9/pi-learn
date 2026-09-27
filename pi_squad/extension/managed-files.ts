import { promises as fs, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  createReadToolDefinition,
  createWriteToolDefinition,
  createEditToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Invocation } from "./invocation.ts";
import { within } from "./project.ts";

export function installManagedFiles(runtime: Invocation): void {
  const root = runtime.identity.root;
  const guard = (name: string, target: string) => {
    let real = target;
    try {
      real = realpathSync(target);
    } catch {
      /* gate resolves existing ancestors for writes */
    }
    if (within(path.join(root, ".agents/pisquad/.runtime"), real))
      throw new Error("CONTROL_PATH_DENIED");
    const reason = runtime.gate.checkTool(name, { path: target });
    if (reason) throw new Error(reason);
  };
  const bindGuard = () => {
    const current = runtime.gate.current;
    const checkCurrent = runtime.captureExecutionFence();
    return {
      current,
      checkCurrent,
      check(name: string, target: string) {
        checkCurrent();
        guard(name, target);
      },
    };
  };
  const read = createReadToolDefinition(root);
  runtime.pi.registerTool({
    ...read,
    async execute(id, params, signal, onUpdate, ctx) {
      const fence = bindGuard();
      let artifact:
        | { path: string; sha256: string; length: number }
        | undefined;
      const guarded = createReadToolDefinition(root, {
        operations: {
          access: async (target) => {
            fence.check("read", target);
            await fs.access(target);
          },
          readFile: async (target) => {
            fence.check("read", target);
            const bytes = await fs.readFile(target);
            fence.checkCurrent();
            artifact = {
              path: realpathSync(target),
              sha256: createHash("sha256").update(bytes).digest("hex"),
              length: bytes.length,
            };
            return bytes;
          },
        },
      });
      const result = await guarded.execute(id, params, signal, onUpdate, ctx);
      fence.checkCurrent();
      if (!artifact || !fence.current) return result;
      return {
        ...result,
        content: [
          ...result.content,
          {
            type: "text" as const,
            text: `Squad immutable file reference (use in artifacts when this file is evidence): ${JSON.stringify(artifact)}`,
          },
        ],
        details: { ...result.details, artifact },
      };
    },
  });
  // The native definitions retain withFileMutationQueue. Each invocation owns
  // its fence, so waiting for that queue never adopts a newer task's authority.
  runtime.pi.registerTool({
    ...createWriteToolDefinition(root),
    async execute(id, params, signal, onUpdate, ctx) {
      const fence = bindGuard();
      const guarded = createWriteToolDefinition(root, {
        operations: {
          mkdir: async (dir) => {
            fence.checkCurrent();
            if (fence.current) {
              const authorized = fence.current.attempt.context.write_set.find(
                (p) => within(dir, p) || within(p, dir),
              );
              if (!authorized) throw new Error("WRITE_SET_DENIED");
              fence.check("write", within(authorized, dir) ? dir : authorized);
            }
            if (within(path.join(root, ".agents"), dir))
              throw new Error("CONTROL_PATH_DENIED");
            await fs.mkdir(dir, { recursive: true });
          },
          writeFile: async (target, content) => {
            fence.check("write", target);
            await fs.writeFile(target, content, "utf8");
          },
        },
      });
      const result = await guarded.execute(id, params, signal, onUpdate, ctx);
      fence.checkCurrent();
      return result;
    },
  });
  runtime.pi.registerTool({
    ...createEditToolDefinition(root),
    async execute(id, params, signal, onUpdate, ctx) {
      const fence = bindGuard();
      const guarded = createEditToolDefinition(root, {
        operations: {
          access: async (target) => {
            fence.check("edit", target);
            await fs.access(target);
          },
          readFile: async (target) => {
            fence.check("edit", target);
            return fs.readFile(target);
          },
          writeFile: async (target, content) => {
            fence.check("edit", target);
            await fs.writeFile(target, content, "utf8");
          },
        },
      });
      const result = await guarded.execute(id, params, signal, onUpdate, ctx);
      fence.checkCurrent();
      return result;
    },
  });
}

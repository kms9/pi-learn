# dsh_squad：DS Bot seam 与 Squad Gate 原型（P1）

P1 阶段的原型。目的是让 DS Bot 中「受控」的 Bot 会话只运行 Controller 准入的工作，并能可靠判断这份工作是否真正结束。依据是 [P0 报告](../docs/dsh-squad-p0-probe-report-2026-10-18.md)；P1 的结果写在同一报告的 §9。

**上游代码不直接修改。** `dsh-bot/` 子模块保持钉住的 `e13bc34` 不变。对 ds-bot 的全部改动集中在一个补丁里；DSH 本身一行没改。

| 路径 | 内容 |
|---|---|
| `patches/ds-bot/0001-squad-seam.patch` | ds-bot 补丁，+152/−9 行：其中新文件 `seam.js` 70 行、测试 59 行，对原有文件只改 5 处 |
| `scripts/prepare-ds-bot.sh` | 从子模块导出钉住的 ds-bot，打上补丁，输出到 `.build/ds-bot`（gitignored）。加 `--test` 时同时跑 ds-bot 全部单测 |
| `gate/` | Squad Gate 插件（`dsh-squad-gate`）。纯逻辑在 `src/`，单测在 `test/` |

## 补丁改了哪些上游文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `src/host/seam.js`（新增） | 对外提供 `dsBotSeam` 服务：`ownerOf`、`attachGate`、`createMessage`、`resolveAgent`、`chatOf`、`groupSessionOf`、`ready` | P0 H2：外部插件拿不到 Bot↔Session 映射 |
| `index.js` | 在 `store` 之后加载 `seam` 模块 | — |
| `src/host/roster.js` | `createSession` 增加可选参数 `owner`。挂了 gate 时，先生成 sessionId 并登记归属，再交给 DSH 的 `session.create({sessionId})`；Bot、群自身、群成员会话的创建处都传入 owner | 会话在**创建时**就有归属，`agent/created` 就能查到 |
| `src/host/groups.js` | 群成员会话创建时传 owner | 同上 |
| `src/host/parts.js` | ① 切段新建 part 时传 owner（带 `partOf`）；② 自己最外层的 pre-step 监听改为先交给 `seam.preStep` | P0 H7：pre-step 的执行顺序会因 reload 变化，Gate 必须固定在 ds-bot 自己的链上 |
| `src/host/resume.js` | 重启后补发（resend）和续跑（resume）之前先问 `seam.allows` | P0 H5：受控会话不能自动重放 |
| `test/squad-seam.test.js`（新增） | seam 单测 | — |

**没挂 gate 时行为与上游完全一致**：不预分配 id，`preStep` 直接放行，`allows` 恒为 true。打补丁后 ds-bot 单测 638/638 通过（上游 635 条加 seam 3 条）。

## Gate 做什么

1. **归属**：`seam.ownerOf(sessionId)` 返回 `{botId, roomId?, place, partOf?}`，在会话创建时即可查到。
2. **位置固定的拦截点**：受控会话的每一步都由 ds-bot 自己的 pre-step 链先交给 gate（`src/policy.js`），不依赖插件注册顺序。下列唤醒入口全部分类处理：`user`、`group-relay`（@Bot）、`group-post`、`bot-request`（message_bot）、`reply`、`stopped`、`schedule`、`resume`（含 resend）、`handoff`（切段）、`retry`、`kickoff`、`group-report`。只有带 Controller 准入的输入才能开启一次 attempt：`source.kind='squad'`，且 `attemptId` 和 `fence` 都与当前一致。其他输入被扣留（hold），并记录原因：
   - `no_admission`：没有准入；
   - `stale_fence`：准入已被更新的 fence 取代；
   - `unknown_attempt`：未知的 attempt。

   attempt 进行中被插进来的外部输入会从本步中**过滤掉**，attempt 继续运行。
3. **两个开关**：`policy.allowResume` 控制重启续跑，`policy.allowSelfStart` 控制 handoff、stopped、reply、retry、report 这些自启回合。两者默认都是 false。
4. **结束判定**（`src/judge.js`）：只有以下条件同时满足才判为 `settled_completed`：
   - 实时 `turn/end` 为 completed；
   - 持久会话日志中同一回合也是 completed（`src/durable.js` 逐帧解码 zstd 日志）；
   - 工具调用 call/result 配对，且实时派发数归零；
   - 没有待处理的审批。

   取消判为 `settled_aborted`，被拒判为 `settled_blocked`。主机重启后没有可确认结束的 attempt，或持久日志写着 `interrupted`，判为 `outcome_unknown`。
5. **冻结模型**：在 pre-step 用 DSH 的 `modelSelection` 投影检查下一次请求的路由，与冻结值不一致就拒绝（`model_mismatch`）。`agent/request` 时再查一次，不一致就抛错，请求发不出去。
6. **不依赖顺序的兜底**：
   - 单调的 `tools.guard`：受控会话没有 attempt 时不能调用任何工具；
   - step 审计：受控会话中出现 gate 没决定过的 `step/start`，立即 cancel。

状态写在 `$DSH_HOME/squad-gate/state.json`，每个决定追加到 `decisions.jsonl`。测试用路由 `/api/squad-gate`（manage、admit、inject-raw、cancel、refresh、state）**替代 Controller**；接入 Go Controller 不在 P1 范围内。

## 运行

```bash
dsh_squad/scripts/prepare-ds-bot.sh --test                 # 构建打补丁的 ds-bot 并跑单测
(cd dsh_squad/gate && npm test)                            # gate 单测
SQUAD=1 MOCK_DELAY_MS=600 CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 probes/bench.sh p1 3201 8901 reset
node probes/drive-p1.mjs p1 3201 8901                       # 受控负例，输出到 probes/scenarios-p1/
probes/bench.sh p1 3201 8901 stop
```

只用 mock 模型，不需要任何 key。

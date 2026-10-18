# probes：DS Bot + DSH 只观察探针（P0）

P0 阶段的实测工具。用于判断 Squad 的输入门、工具门、结束判定和恢复门，能否靠 DSH 和 DS Bot 的公开 Hook 实现。结论见 [`docs/dsh-squad-p0-probe-report-2026-10-18.md`](../docs/dsh-squad-p0-probe-report-2026-10-18.md)。

| 路径 | 内容 |
|---|---|
| `dsh-probe/` | 探针插件（DSH Cordis 插件，作为 `dsh-squad-probe` 装在 ds-bot 之后）。只注册监听；waterfall 原样返回 `next()` 的结果，不拦截任何东西。每行写入前脱敏：去掉环境里的 key 值，以及形如 `sk-…` 的串 |
| `dsh-probe-driver/` | **测试专用**插件，和探针分开。提供 `/api/squad-probe-driver`，用于建一个指定 preset（如 `ptc`）的普通 DSH Session 并发消息，供 S8 观察嵌套调用 |
| `bench.sh` | 本机 bench：ds-bot 自带的 mock 模型 + npm 版 DSH Web + ds-bot（来自子模块）+ 探针。数据放在 `probes/.run/<name>`，作为隔离的 `DSH_HOME`，不碰 `~/.dsh` |
| `lib.mjs` | 两个驱动脚本共用的登录、API、等待安静、按场景记录 |
| `drive.mjs` | mock 模型：依次触发六个场景，每个场景输出 `scenarios/<id>.jsonl` 和 `<id>.meta.json` |
| `drive-real.mjs` | 真实 DeepSeek 模型：六个场景，加上 S7 回合内切段、S8 嵌套 PTC、S9 模型回退，输出到 `scenarios-real/` |
| `tokens.mjs` | 按场景汇总 token：回合调用来自探针，辅助调用来自 DS Bot ledger |
| `analyze.mjs` | 把 JSONL 生成可读时间线 `<id>.timeline.md`（`--dir scenarios-real` 处理真实模型那一轮） |
| `versions.lock.json` | 实测时固定的 DSH 和 DS Bot 版本 |
| `scenarios/` | 2026-10-18 mock 模型一次干净运行的全部记录（S0 setup + S1–S6） |
| `scenarios-real/` | 2026-10-18 真实 DeepSeek 模型运行记录（S0–S9）和 `tokens.json` |

## 记录了什么

每行一个 JSON：`seq/ts/mono/pid/event/session/owner` 加摘要。

- **agent**：`created`、`disposed`、`status`、`error`、`turn-stopping`、`assistant-stream`（只记边界）。另外 `probe/when-idle` 记录 `whenIdle()` 何时 resolve。
- **inbox**：`inserted`、`claimed`、`discarded`，含消息 `source` 和正文开头。
- **step**：`pre-step`（输入、决策）、`request`（provider/model/effort）、`request-error`、`llm/stream`（谁调用了模型、purpose）。
- **tools**：`pre-execute`（决策）、`execute`（真实执行起止）、`result`，以及 `approval/request`。
- **session**：`created`、`disposed`、`event`（持久日志的每条事件类型）。

`owner` 字段由探针只读地读取 `DSH_HOME/bot/state.json` 推出来。读不到时就留空，这本身就是要测的 seam 缺口。

## 运行

```bash
# node>=22.19；pnpm 11（profile 安装用）
CONTEXT_WINDOW=100000 CHECK_RATIO=0.45 probes/bench.sh p0 3197 8897 reset
node probes/drive.mjs p0 3197 8897                 # 或指定场景：S4-restart S6-cancel
node probes/analyze.mjs
probes/bench.sh p0 3197 8897 stop
```

mock 模式不需要任何 API key：模型请求全部发往 `ds-bot/dev/mock-llm.mjs`。场景里的指令（`转告`、`群发`、`慢慢做 N`、`长文 N`、`派活 N`）都是这个 mock 的脚本命令。

### 真实模型

```bash
set -a; . ~/.secrets/deepseek.env; set +a        # DEEPSEEK_BASE_URL、DEEPSEEK_API_KEY 只放在进程环境里
MODEL=real CONTEXT_WINDOW=60000 CHECK_RATIO=0.45 probes/bench.sh real 3198 8898 reset
node probes/drive-real.mjs real 3198 8898        # 约 106 万 token，其中约 85% 是 cache read
node probes/analyze.mjs --dir scenarios-real && node probes/tokens.mjs real scenarios-real
probes/bench.sh real 3198 8898 stop
```

- DSH 用 Anthropic Messages 协议，bench 会把 `DEEPSEEK_BASE_URL` 补成 `<base>/anthropic`。
- key 不写进任何文件。提交前用 `grep -rF "$DEEPSEEK_API_KEY" probes docs` 和 `grep -rE '\bsk-[A-Za-z0-9_-]{16,}'` 检查。

## 场景

| ID | 触发 |
|---|---|
| S0-setup | Chief 选模型，建 Researcher/Builder/Reviewer（两种模型路由），建四人群 |
| S1-mention | 群里 `@Researcher` |
| S2-bot-to-bot | Chief `message_bot` 给 Builder；Chief `post_to_group` → `group_relay` |
| S3-schedule | 给 Reviewer 建一个 70 s 后到期的定时任务 |
| S4-restart | Builder 做 25 s 工作时 SIGTERM 重启 Web 主机 |
| S5-part-switch | Researcher 连续长文，触发 ds-bot 切到新 part |
| S6-cancel | 群里 `派活 40`（真实模型：让 @Builder 写约 800 字），开始后用户 `stop-member-work` |
| S7-midturn-switch | 真实模型：Builder 连续 read 三个文件，第一次 read 后改它的 workDir |
| S8-ptc-nested | 真实模型：`ptc` preset 的普通 Session，`run_code` 里调用 read |
| S9-fallback | 真实模型：从目录中移除 Reviewer 的 `deepseek-v4-pro`，重启后再让它回复 |

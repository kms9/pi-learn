# probes：DS Bot + DSH 只观察探针（P0）

P0 阶段的实测工具。用于判断 Squad 的输入门、工具门、结束判定和恢复门，能否靠 DSH 和 DS Bot 的公开 Hook 实现。结论见 [`docs/dsh-squad-p0-probe-report-2026-10-18.md`](../docs/dsh-squad-p0-probe-report-2026-10-18.md)。

| 路径 | 内容 |
|---|---|
| `dsh-probe/` | 探针插件（DSH Cordis 插件，作为 `dsh-squad-probe` 装在 ds-bot 之后）。只注册监听；waterfall 原样返回 `next()` 的结果，不拦截任何东西 |
| `bench.sh` | 本机 bench：ds-bot 自带的 mock 模型 + npm 版 DSH Web + ds-bot（来自子模块）+ 探针。数据放在 `probes/.run/<name>`，作为隔离的 `DSH_HOME`，不碰 `~/.dsh` |
| `drive.mjs` | 依次触发六个场景，每个场景输出 `scenarios/<id>.jsonl` 和 `<id>.meta.json` |
| `analyze.mjs` | 把 JSONL 生成可读时间线 `scenarios/<id>.timeline.md` |
| `versions.lock.json` | 实测时固定的 DSH 和 DS Bot 版本 |
| `scenarios/` | 2026-10-18 一次干净运行的全部记录（S0 setup + S1–S6） |

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

不需要任何 API key：模型请求全部发往 `ds-bot/dev/mock-llm.mjs`。场景里的指令（`转告`、`群发`、`慢慢做 N`、`长文 N`、`派活 N`）都是这个 mock 的脚本命令。

## 场景

| ID | 触发 |
|---|---|
| S0-setup | Chief 选模型，建 Researcher/Builder/Reviewer（两种模型路由），建四人群 |
| S1-mention | 群里 `@Researcher` |
| S2-bot-to-bot | Chief `message_bot` 给 Builder；Chief `post_to_group` → `group_relay` |
| S3-schedule | 给 Reviewer 建一个 70 s 后到期的定时任务 |
| S4-restart | Builder 做 25 s 工作时 SIGTERM 重启 Web 主机 |
| S5-part-switch | Researcher 连续长文，触发 ds-bot 切到新 part |
| S6-cancel | 群里 `派活 40`，5 s 后用户 `stop-member-work` |

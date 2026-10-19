# DSH Squad 使用说明

DS Bot（DSH 宿主）+ Squad Controller 的配置与启动。只写已经能用的功能；进度见 `docs/dsh-squad-dev-plan-2026-10-18.md`。已完成 **M1（DSH Adapter）** 和 **M0（一键启动与预置团队）**：按项目目录一条命令启动 DS Bot + Controller；正式 Task 能从 Controller 派发到受控 Bot、执行、上报结束。界面、Run/Team 工作流在后续里程碑。

固定版本（D9）：DSH `0.2.1-rc.2`，ds-bot `e13bc34` 加 `patches/ds-bot/0001-squad-seam.patch`。

## 0. 最快上手：一个项目目录一条命令

```bash
dsh_squad/deploy/dsh-squad up ~/my-project --mock      # 开发：脚本化 mock 模型，不需要 key
DEEPSEEK_API_KEY=... dsh_squad/deploy/dsh-squad up ~/my-project   # 真实 DeepSeek API
dsh_squad/deploy/dsh-squad provision ~/my-project      # 预置 Chief、Researcher、Builder、Reviewer、群「小队群」、一条团队记忆
dsh_squad/deploy/dsh-squad status ~/my-project         # 进程、Controller 地址、浏览器登录链接
dsh_squad/deploy/dsh-squad down ~/my-project
```

- 一个项目目录 = 一个 DS Bot 宿主 + 一个 Controller（D4），每人自己部署，不做多租户。
- `up` 第一次会安装钉住的 DSH、打补丁的 ds-bot 并编译 Controller（放在 `dsh_squad/.build/`）。项目里没有 `.agents/dshsquad/` 时写入默认小队（研究员、实现者、审查者，Team `default`）。
- 数据在 `<项目>/.dsh-squad/`：`home/`（DS Bot 的 Bot、会话、记忆）、`controller/state.sqlite`、`logs/`、`run/`（pid）、`team.json`（预置的 Bot id）。Controller 的锁、discovery 和 operator 凭据仍在 `.agents/dshsquad/.runtime/`。
- `--port N` 改网页端口（默认 3400）。`--mock` 每次 `up` 都要带；不带时需要 `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_BASE_URL`，默认 `https://api.deepseek.com`），key 不会写到磁盘。
- `provision` 可重复执行，已有的 Bot 和群不会重复创建；所有 Bot 用 `deepseek-flash`、推理强度 high（D7）。
- 这时所有 Bot 都是 Free 模式：正常私聊、群聊、`@Bot`、记忆，Adapter 不接管任何会话。让某个 Bot 受控见第 5 节。

## 1. 准备（手动）

```bash
dsh_squad/scripts/prepare-ds-bot.sh          # 导出钉住的 ds-bot 并打 seam 补丁 → dsh_squad/.build/ds-bot
dsh_squad/scripts/check.sh                   # 编译、单测、补丁后 ds-bot 单测
```

## 2. 项目目录

一个项目目录对应一个 Controller（D4）。配置放在 `.agents/dshsquad/`：

```
.agents/dshsquad/
  roles/<role>/role.md        # frontmatter: name（= 目录名）、description；正文是角色说明
  roles/<role>/agents.md      # 工作规则
  teams/<team>/team.json      # schema_version 1、leader、members、policy（见下）
  teams/<team>/instructions.md
  teams/<team>/workflows/<id>.json   # 可选
```

`team.json` 的 `policy.allowed_tools` 只能是 `read grep find ls write edit`；在 DSH 里分别对应 `read/read_image`、`grep`、`glob`、`glob`、`write`、`edit/str_replace_editor`。正式任务里其它工具（shell、`run_code`、`message_bot`、MCP 等）一律拒绝。

## 3. 手动启动 Controller（`up` 已包含）

```bash
cd dsh_squad/controller
go run ./cmd/controller serve --project-root /path/to/project
go run ./cmd/controller doctor --project-root /path/to/project --ds-bot-dir ../.build/ds-bot
```

`serve` 把 endpoint 写进 `.agents/dshsquad/.runtime/controller.json`，operator 凭据在同目录 `operator.token`（0600）。协议 `squad/3`，见 `dsh_squad/protocol/README.md`。

## 4. 手动启动 DS Bot 宿主并接上 Controller（`up` 已包含）

宿主的 profile 里加载打过补丁的 ds-bot 和 `dsh_squad/adapter`（插件名 `dsh-squad-adapter`）。设置 `DSH_SQUAD_PROJECT=<项目目录>` 后，Adapter 读取 discovery 文件连接 Controller；不设时只有测试替身路由。

开发用 bench（mock 模型）：

```bash
SQUAD=1 SQUAD_MOCK=1 DSH_SQUAD_PROJECT=/path/to/project probes/bench.sh <name> <web-port> <mock-port> reset
```

## 5. 让一个 Bot 受控

目前用宿主路由 `POST /api/squad-adapter`（需登录 cookie），`{"endpoint":"manage","payload":{...}}`：

| 字段 | 说明 |
|---|---|
| `botId` | DS Bot 的 Bot id |
| `roomId` | 可选；给出时受控的是该 Bot 在这个群里的会话 |
| `agentId`、`roleId` | 给出时这个（Bot, 位置）注册为 Controller runtime，从 Controller 拉取正式任务 |
| `frozen` | 可选 `{provider, model}`；路由不一致时拒绝，不静默回退 |
| `policy` | 可选 `{allowResume, allowSelfStart}`，默认都关 |

`unmanage` 取消；`state` 查看绑定、attempt、被扣留的输入和待发报告。受控会话只运行 Controller 准入的任务：其它唤醒（用户、`@Bot`、`message_bot`、群消息、定时、重启续跑、切段自启）一律扣留，并上报给 Controller（快照视图 `held_inputs`）。

## 6. 下发正式任务（operator）

```bash
curl -X POST "$ENDPOINT/v2/tasks/direct" \
  -H "Authorization: Bearer $(cat .agents/dshsquad/.runtime/operator.token)" \
  -H "X-Squad-Protocol: squad/3" -H "X-Squad-Controller: $CONTROLLER_ID" \
  -d '{"request_id":"r1","target":"builder-bot","kind":"execute","goal":"解释什么是分数"}'
```

`GET /v2/tasks/<id>`、`GET /v2/snapshot` 查看进度。

## 7. 受控会话里的任务工具

| 工具 | 作用 |
|---|---|
| `squad_task` | 读当前任务：目标、验收、上游结果 |
| `squad_submit_result` | 提交结果（JSON 对象或文字）；只有提交并且回合确认结束（实时 + 持久日志 + 工具配对），任务才算完成 |
| `squad_yield` | 等待依赖或子任务 |
| `squad_delegate` | 把一部分交给另一个角色作为子任务；子任务没回传前父任务不能完成 |
| `squad_clarify` | 向委派方提问 |

受控会话的系统提示里有 `# Squad task` 段（角色、团队说明、任务、可用工具），其 hash 记在 Adapter 日志。

## 8. 故障时

- 宿主重启：进行中的 attempt 上报 `host_restart`，Controller 把任务置为 `interrupted`，不自动重放，等 operator `POST /v2/attempts/<id>/reconcile`。
- 无法确认结束（`outcome_unknown`）：同上，原因 `outcome_unknown`。
- DS Bot 切段换了新会话：Adapter 带旧会话重新注册，`binding_epoch` 加 1，旧 attempt 作废。

Adapter 状态在 `$DSH_HOME/squad-adapter/state.json`（0600），每个决定追加在 `decisions.jsonl`。

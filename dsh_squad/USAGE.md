# DSH Squad 使用说明

DS Bot（DSH 宿主）+ Squad Controller 的配置与启动。只写已经能用的功能；进度见 `docs/dsh-squad-dev-plan-2026-10-18.md`。已完成 **M1（DSH Adapter）**、**M0（一键启动与预置团队）**、**M2（单 Team 交付）**、**M3（界面与对照实验）**：按项目目录一条命令启动 DS Bot + Controller；在 DS Bot 页面里建小队、定规则、开始 Run、看进度和成果、处理审核与恢复；对照实验工具。多 Team 协同在 M4。

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

## 0.1 在 DS Bot 页面里用 Squad（M3）

左下角「小队」按钮打开 Squad 页面，三个标签：

- **运行**：选小队和流程、写目标、点「开始」（没绑定群的小队会自动建群并绑定）。左边是 Run 列表；右边是选中 Run 的详情：
  - **任务依赖图**：每个任务的角色、状态、审核结论；被退回的版本虚线框，返工用红色虚线连接。
  - 三类需要你处理的卡片分开显示：**需要你回答**（Run 暂停或受阻时，写给 Leader 的说明）、**需要你批准工具**（受控成员等待的工具审批）、**需要你验收成果**（验收方式为人工的任务）。每张卡片都绑定它画出来时的版本，任务已经变了会被拒绝，请刷新后再操作。
  - **需要恢复**：执行状态不确定的任务。先勾选「我确认这次执行已经停止」再释放，之后可以重试或取消。
  - **成果文件**：每个版本都在，标出已通过、待审核、已被返工取代；HTML 点「预览」在隔离窗口里打开（另一个主机名、沙箱，读不到 DS Bot 的登录和数据）。
  - 随时可以给 Leader 补充说明，或取消 Run。
- **小队与规则**：不用写文件就能新建、修改小队（成员角色、Leader、验收方式、审核角色、默认流程、说明）、角色（说明与工作规则）、流程（步骤、角色、先后顺序和开始条件）。「检查」只校验不保存；「保存」由 Controller 校验整个配置后才写入，改小队的说明或流程会自动升版本；别人先改过同一个文件会提示重新读取。
- **实验报告**：对照实验的结果（见第 10 节）。

绑定了小队的群，输入框上方有一条状态：当前 Run 进度和「查看进度」。页面上方如果出现黄色提示，说明有成员没连上 Controller，并写明原因。

页面只通过 DS Bot 自己的登录访问宿主；operator 凭据留在宿主上，不会发给浏览器。

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
| `squad_submit_result` | 提交结果（JSON 对象或文字），可附一个文件（`file_name`、`file_content`、`file_type`）；只有提交并且回合确认结束（实时 + 持久日志 + 工具配对），任务才算完成 |
| `squad_review` | 审核任务：`accepted` 或 `rejected` 加理由，自动引用被审的精确版本 |
| `squad_decide` | Leader 步骤：`dispatch`（附步骤 JSON）、`wait`、`complete` |
| `squad_yield` | 等待依赖或子任务 |
| `squad_delegate` | 把一部分交给另一个角色作为子任务；子任务没回传前父任务不能完成 |
| `squad_clarify` | 向委派方提问 |

受控会话的系统提示里有 `# Squad task` 段（角色、团队说明、任务、可用工具），其 hash 记在 Adapter 日志。

## 8. Team 与 Run（单 Team）

**把 Team 绑到一个群**（宿主路由 `POST /api/squad-adapter`，`{"endpoint":"bind-team","payload":{"teamId":"math"}}`，可选 `roomId`）：

- Leader（`team.json` 的 `leader.agent_ref`，如 `chief` → Bot「Chief」）和每个角色（`builder` → Bot「Builder」）各对应一个 Bot；没有的自动创建（说明取自 `role.md`，模型跟 Leader 的 Bot 一致）。
- 群默认叫「<team> 小队」，没有就创建；每个成员在群里的会话提前打开，并各自注册为 Controller runtime（Leader 用 leader 模式，角色的 agent id 为 `<team>-<role>`）。
- 一个群对应一个 Team；一个 Team 同时只有一个 active Run。

**开始一个 Run**（operator）：`POST /v2/runs {"request_id","team_id","goal","workflow_id"?}`，不给 `workflow_id` 用 Team 的 `default_workflow`。之后：

- Controller 按依赖派发 Workflow 的步骤；`acceptance_policy.mode` 为 `review` 时，每个结果自动生成一个审核任务，交给 `reviewer_ref` 指定的角色（作者与审核者必须不同）。
- 审核用 `squad_review`（通过/退回 + 理由），它会精确引用被审的结果版本。
- Leader 每次 Run 状态变化都会收到一个 Leader 步骤，系统提示里有「Run status」和用户在群里说的话，用 `squad_decide` 决定：`dispatch`（如对退回的任务派 `rework`）、`wait`、`complete`。`complete` 要通过最终关卡：所有业务任务通过、没有未收尾的执行。
- 被退回的版本保留，返工是新任务（`superseded_by` 指向返工）。

**群里说话**：Run 进行中，用户在 Team 的群里（或直接对成员）说的话会被扣留，并作为 Run Guidance 交给 Leader（同一句只记一次）；没有进行中的 Run 时保持 `pending`。

**提交文件（Artifact）**：`squad_submit_result` 可带 `file_name`、`file_content`、`file_type`。文件存进 Controller 的内容寻址目录（`.dsh-squad/controller/artifacts/sha256/<hash>`，只写一次），结果以 `artifact:sha256/<hash>` 引用。`GET /v2/artifacts/sha256/<hash>` 读回；HTML 带 `Content-Security-Policy: sandbox` 且禁止任何网络请求，脚本拿不到 DS Bot 的 Cookie 或接口。

**人工验收**（`acceptance_policy.mode` 为 `human` 的任务）：`POST /v2/tasks/<id>/acceptance {"request_id","expected_revision","decision","result_hash","note"}`，`result_hash` 和 `expected_revision` 必须是当前版本，旧卡片会被拒绝。

**案例**：`dsh_squad/cases/math/`（数学知识点课件），用法见其 README。

## 10. 对照实验（M3-3）

```bash
node dsh_squad/experiments/run.mjs --mock --groups S,A,B,C --repeats 1 --publish ~/my-project
DEEPSEEK_API_KEY=... node dsh_squad/experiments/run.mjs --repeats 3 --publish ~/my-project
```

同一个任务（`--goal`，默认数学课件）用四种做法各跑一遍：S 单个 Agent、A DS Bot 自由协作、B Squad 任务 DAG（完成即通过，不审核）、C Squad DAG + 独立审核。每组每次都在新的项目目录里起一对新的 DS Bot + Controller，互不继承 Bot、记忆和结果（D12）；所有组用同一个模型（D7）。Token 和调用次数取自 DS Bot 的用量账本，含记忆、摘要等辅助调用。报告写到 `dsh_squad/experiments/reports/`，`--publish` 时同时放进该项目，在「实验报告」标签里看。mock 跑出的报告会标明「数字不代表真实效果」。

正式 Run 里受控会话的记忆是只读的：可以 `recall`，不能 `remember`/`forget`（D12）。

## 9. 故障时

- 宿主重启：进行中的 attempt 上报 `host_restart`，Controller 把任务置为 `interrupted`，不自动重放，等 operator `POST /v2/attempts/<id>/reconcile`。
- 无法确认结束（`outcome_unknown`）：同上，原因 `outcome_unknown`。
- DS Bot 切段换了新会话：Adapter 带旧会话重新注册，`binding_epoch` 加 1，旧 attempt 作废。

Adapter 状态在 `$DSH_HOME/squad-adapter/state.json`（0600），每个决定追加在 `decisions.jsonl`。

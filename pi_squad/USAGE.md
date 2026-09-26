# Pi Squad 插件：配置与启动

这是 `pi_squad` 已落地功能的唯一配置与启动说明。增加可用功能时，同一次改动更新本文的字段、启动命令、会话命令与工具；阶段验收仍以 `pi_squad_case/` 为准。

## 当前能做什么

- 从启动 cwd 的 `.agents/roles/*/role.md` 加载 Markdown + YAML frontmatter 角色，通过 `PI_SQUAD_ROLE_ID` 精确选择。
- 缓存角色正文，每轮用户输入开始时追加到 Pi 原系统提示；description 只用于展示和上报。
- `list_agents` 按角色/小队/在线状态发现候选，`get_agent` 按返回的 agent_id 精确查询单个 Agent。
- 向 Go Controller 注册身份、角色简介、启动 cwd、运行实例 UUID 和可选 Pi/Herdr 映射；定时心跳、查询 Agent。
- `/squad-whoami` 检查配置路径、身份、cwd、UUID、注册和注入结果。
- `send_message` 发送 notice/ask，`reply_message` 关联回复，`read_inbox` / `get_message` 查询；`/squad-inbox` 查看当前会话收件箱。
- Controller 的 `agents list` / `agents get` / `tui` 只读查看，TUI 选中行下显示 cwd、UUID 和角色简介。

已实现同队纯文本消息、关联回复和受限异步 ask，真实 Pi 通信验收待 Claude 完成。没有实现任务委派、自动启动/恢复 Agent、tools/model/skills 配置或智能体历史管理。角色正文的行为要求不是工具权限限制。

## 安装

在本仓库根目录安装 YAML 依赖：

```bash
npm ci --prefix pi_squad
```

Pi 提供 `@earendil-works/pi-coding-agent` / `@earendil-works/pi-ai` / `typebox` 运行时；本包显式安装 `yaml`，不依赖 Pi 的间接依赖。

日常使用可一次性登记本地扩展入口（之前已登记此入口不必重复）：

```bash
pi install /Users/logo/self_repo/pi_case/pi_squad/extension/index.ts
pi list
```

新环境也可安装包目录 `pi install /Users/logo/self_repo/pi_case/pi_squad`，包清单声明了扩展入口。入口和包目录二选一，避免重复加载。只用于当前项目可加 `-l`。

## 角色文件

本仓库提供 `.agents/roles/reviewer/role.md` 和 `.agents/roles/backend/role.md`。在其他项目启动 Pi 时，在那个项目的 cwd 建立同样目录。例如：

```markdown
---
name: reviewer
description: 审查代码变更，定位正确性、并发和回归风险。
---

# 职责
你负责代码审查，找出有证据、值得修复的问题。

# 工作方式
先阅读项目约定、变更与相关测试，区分事实和推测。

# 边界
默认只审查；任务明确要求修复时再修改代码。

# 交付要求
给出问题位置、触发条件、影响、修复建议和验证方法。
```

| 内容 | 规则 |
|---|---|
| `name` | 必填，角色选择键，也是上报的 `role`；小写字母/数字，可用连字符分隔 |
| `description` | 必填非空字符串；上报为 `role_description`，不注入当前 Agent 的系统提示 |
| Markdown 正文 | 必填非空；整体作为角色提示追加，标题不是程序 schema |
| 目录与入口 | 每个角色一个 `<name>/` 目录，入口固定 `role.md`；目录名必须等于 name，重复 name 报错 |

只支持这两个 frontmatter 字段。未知字段、重复 YAML 键、非法 YAML、空正文都会报错。每个文件上限 64 KiB。仅枚举 `.agents/roles/` 的直接角色子目录并读取各自的 `role.md`，角色目录和入口不接受软链接，不搜索父目录或 home。角色目录中的其它文件和子目录均不读取、不注入、不改写。目录内任意角色文件不合法时本次配置加载失败，修复后重启 Pi。

目录结构：

```text
.agents/roles/
├── reviewer/
│   └── role.md
└── backend/
    └── role.md
```

后续动态信息可以放在各角色目录内；当前只识别 `role.md`，不创建动态信息文件，也不赋予其它文件特殊语义。同角色的多个运行实例仍共享这个角色目录，未来写入实例数据时应按 runtime_id 分开。

旧的 `.agents/roles/reviewer.md` 需移动为 `.agents/roles/reviewer/role.md`；检测到旧平铺角色会给迁移错误，不双轨加载。启动环境变量保持不变，迁移后重启 Pi 才会刷新进程缓存。

## 启动

### 1. Controller

```bash
cd pi_squad/controller
go run ./cmd/controller \
  -listen 127.0.0.1:18741 \
  -db /tmp/pi_squad.sqlite \
  -heartbeat-timeout 15s
```

`serve` 子命令等价。环境变量为 `PI_SQUAD_LISTEN`、`PI_SQUAD_DB`、`PI_SQUAD_HEARTBEAT_TIMEOUT`。使用已有数据库会自动增加 `cwd`、`runtime_id`、`role_description` 列，保留旧记录；历史缺失值保持空。新增 owners/revoked_runtimes/messages 表；旧身份记录须按下文显式 release，不能由新 UUID 覆盖。

### 2. Pi

在项目根目录、每个角色一个终端启动：

```bash
cd /Users/logo/self_repo/pi_case
PI_SQUAD_ROLE_ID=reviewer PI_SQUAD_AGENT_ID=reviewer PI_SQUAD_ID=alpha pi
```

另一个终端：

```bash
cd /Users/logo/self_repo/pi_case
PI_SQUAD_ROLE_ID=backend PI_SQUAD_AGENT_ID=backend PI_SQUAD_ID=alpha pi
```

未安装扩展时可隔离试跑，在相同环境变量后使用：

```bash
PI_SQUAD_ROLE_ID=reviewer PI_SQUAD_AGENT_ID=reviewer PI_SQUAD_ID=alpha \
  pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

多个 Pi 可以使用同一个 role id，但需提供不同 `PI_SQUAD_AGENT_ID`。同 agent_id 只允许持有原 runtime_id 和运行凭据的进程更新；其它 UUID 即使原实例 offline 也返回 409。重启进程前需显式释放旧实例。runtime_id 不是 Registry 主键。

| 环境变量 | 用途 |
|---|---|
| `PI_SQUAD_ROLE_ID` | 选择角色 name；未设置时安静停用 Squad 注册与提示注入 |
| `PI_SQUAD_AGENT_ID` | 启用时必填，逻辑 Agent 身份 |
| `PI_SQUAD_ID` | 启用时必填，所属 squad |
| `PI_SQUAD_CONTROLLER_URL` | 默认 `http://127.0.0.1:18741` |
| `PI_SQUAD_HEARTBEAT_INTERVAL_MS` | 默认 `5000`；无效值使用默认 |
| `HERDR_WORKSPACE_ID` / `PI_SQUAD_SPACE_ID` | 可选，前者优先，上报为 `space_id` |
| `HERDR_PANE_ID` / `PI_SQUAD_PANE_ID` | 可选，前者优先，上报为 `pane_id` |
| `PI_SQUAD_HERDR_SESSION_ID` / `HERDR_SESSION_NAME` / `HERDR_SESSION` | 可选，按顺序取首个非空值 |

`PI_SQUAD_ROLE` 不再用于选择角色或覆盖 Registry 标签，role 总是选中的 name。缺少身份变量、未知角色或格式错误会告警并跳过注册与提示注入。Controller 连接失败不抹掉已加载角色，whoami 会显示未注册。

### 3. cwd、UUID 与会话

- `cwd`：首次加载插件时的 `process.cwd()` 绝对路径，也是角色发现根目录。
- `runtime_id`：首次加载插件时用 `crypto.randomUUID()` 生成的 UUID v4，一个 Pi 进程一个；重启 Pi 会变化。
- `runtime_session_id`：来自 Pi `getSessionId()`，注册时必填；它不是 runtime_id。
- 角色、身份、cwd、runtime_id 保存在进程级缓存。`/new` 和扩展 `/reload` 保留同一启动快照，不重新扫描角色文件；`/new` 会用新的 Pi session id 重新注册。
- 修改角色、环境变量或启动目录后需重启 Pi 生效。扩展自动发现方式支持的 `/reload` 可重新加载代码，但不会刷新上述启动配置。

Registry 上报 `role_description`，不上传 Markdown 角色正文。HTTP/Pi RPC 仍用 JSON；本次替换的是手写角色配置格式。

## 会话里怎么用

| 入口 | 作用 |
|---|---|
| `/squad-whoami` | 显示 source=role、角色文件路径 config_path、角色目录 role_dir、角色名/简介/正文、身份、cwd、runtime_id、runtime_session_id，以及 registered/injected |
| `list_agents` | 查询 Controller，可选 agent_id、role、squad_id、status；包含 cwd、runtime_id、role_description |
| `get_agent` | 必填 agent_id，返回 `{ agent }` 单个记录；离线可查，未知 ID 报错，不按 role 或 pane 猜测目标 |

发现流程（模型工具调用参数）：

```text
list_agents({"role":"reviewer","squad_id":"alpha","status":"online"})
get_agent({"agent_id":"reviewer-1"})
```

第二步必须使用第一步实际返回的 agent_id，`reviewer-1` 只是示例。相同 role 可以对应多个实例，需要选择具体 agent_id；空列表表示无匹配项，不自动启动 Agent。未传筛选条件时列表包含自身、其它小队及离线记录；查看同队在线成员时显式传 squad_id/status。

未配置本机身份时，发现工具仍可查询 `PI_SQUAD_CONTROLLER_URL` 指定的 Controller，本机不会因此注册。

get_agent 返回查询时快照，包含已有的身份、cwd、runtime_id、runtime_session_id、status、last_seen 等字段。它不保证之后仍在线或锁定该进程，也不发送消息。两项工具文本超过 Pi 默认截断上限时给出提示，完整结构保留在 details；可缩小筛选后再精确查询。

首次普通用户输入前 `injected=false` 正常。每轮 `before_agent_start` 追加缓存正文，不写入 transcript。配置目录只提供角色定义，在线名单来自 Controller。

Controller 外部查询：

```bash
curl -s http://127.0.0.1:18741/health
curl -s http://127.0.0.1:18741/agents | python3 -m json.tool
cd pi_squad/controller
go run ./cmd/controller agents get reviewer
go run ./cmd/controller tui
```

## 从旧 JSON 配置迁移

1. 把旧文件 role 对应的角色写入 `.agents/roles/<name>/role.md` 的 name。
2. 新增 description，把 role_prompt 移为 Markdown 正文。
3. 将 agent_id、squad_id、Controller/Herdr 参数移到启动环境。
4. 取消 `PI_SQUAD_CONFIG`，设置 `PI_SQUAD_ROLE_ID`，重新启动 Pi。

旧 `PI_SQUAD_CONFIG` 一旦非空会明确报迁移错误，不回退其他身份。仅设置旧 `PI_SQUAD_ROLE` 不会启用插件。旧 JSON 文件不会被自动删除。

## 查看角色注入与模型调用链

使用 `pi-trace-extension`。2026-09-24 本机 `pi list` 已确认安装，无需重复安装；新环境执行 `pi install npm:pi-trace-extension`。

日常模式按上一节直接启动 `pi`，自动加载已安装扩展。若继续做隔离实验，需显式加载 Squad 和 Trace：

```bash
cd /Users/logo/self_repo/pi_case
PI_SQUAD_ROLE_ID=reviewer PI_SQUAD_AGENT_ID=reviewer PI_SQUAD_ID=alpha \
  pi --no-extensions \
  -e "$PWD/pi_squad/extension/index.ts" \
  -e "$HOME/.pi/agent/npm/node_modules/pi-trace-extension/extensions/trace/index.ts"
```

最后一个路径来自本机 `pi list`；其他环境按实际安装路径调整。

1. `/squad-whoami` 检查配置。第一句输入之前 `injected` 为 false 是正常的。
2. 发送一条普通消息，让 `before_agent_start` 追加角色提示，并触发模型请求。
3. `/trace` 打开当前会话。选择 `llm-generation` 的 Input，检查 provider 对应的 `system`、`instructions` 或 `messages` 字段，搜索 `Pi Squad role` 与角色文本。
4. 查看相邻工具节点的参数、结果、耗时；`/trace all` 打开跨会话 dashboard。

Trace 在 `before_provider_request` 采集 payload，因此可观察角色注入之后的请求。单字符串有 8000 字符截断及字段脱敏，不能当作无损原始请求；角色位于长 system prompt 末尾时可能被截掉，找不到不等于没注入。`/squad-whoami` 只证明 Squad 自己生成过追加结果，不证明后续扩展没有改动它。

首次请求之前没有最终请求快照；此前未启用 Trace 的历史请求也不会被补录。Trace 观察 Pi 模型和工具生命周期，不会自动追踪 Go Controller 内部 HTTP/SQLite 调用，也不会自动把多个独立 Squad Pi 拼成分布式链路。`pi-context` 的 `/context` 更适合看 token 分布和历史管理，不作为本问题的主要追踪工具。

证据：[Pi 包规则](../docs-zh/pi-dev/packages/coding-agent/docs/packages.md)、[Squad 注入实现](extension/index.ts)、[Trace 采集实现](../pi-trace-extension/extensions/trace/index.ts)。

## 自动核对

```bash
npm test --prefix pi_squad
(cd pi_squad/controller && go test ./...)
node pi_squad_case/phase_00_identity/verify-config-pi.mjs
```

真实 Pi 验证使用临时 cwd、临时数据库和独立进程，检查角色选择/注入、cwd、不同进程 UUID、description 上报、裸 Pi 不注册、`/new` 保持启动快照。观察扩展注册专用本地测试 provider，streamSimple 直接结束，不需要模型回复，不发送模型 HTTP 请求。

Controller 原有注册心跳 smoke：`./pi_squad_case/phase_00_identity/smoke.sh`。

## 服务日志与 Dashboard

不带子命令或使用 `serve` 时，当前终端运行的是 HTTP 服务，不会显示 Dashboard。正常心跳不逐条打印；启动、注册及内部错误日志仍保留。日志降噪不会改变心跳、last_seen 或在线判断。

Dashboard 是独立的只读 `tui` 客户端，应在另一个终端连接服务的实际端口。例如服务用 `--listen 127.0.0.1:18751`：

```bash
cd /Users/logo/self_repo/pi_case/pi_squad/controller
go run ./cmd/controller tui --url http://127.0.0.1:18751
```

不要遗漏 `tui`，也不要误用默认的 18741。面板每两秒刷新，方向键选择 Agent，`r` 手动刷新，`q` 只退出面板。保留足够终端高度以显示表格和选中成员详情。检查插件时按 `AGENTS.md`：先关掉上次留下的测试 workspace，再新开 workspace；至少三个不同角色的 Pi，启动 cwd 用当前项目目录以检查其中的 `.agents/roles`，并打开这块对应 Dashboard。

若只想让一个可见 pane 展示面板，可在下次启动时由服务管理器或单独后台进程运行 `serve`，将 stderr 重定向至日志文件，再在 pane 中运行 `tui`；先停止旧服务后才能用相同端口启动新服务。不要直接在正在运行的服务前台输入 `tui` 命令。

## 运行实例校验与显式释放

Extension 自动产生进程 UUID 和私有 `runtime_token`，均跨 `/new`、`/reload` 保留；token 不出现在 whoami、发现结果或消息正文中。Controller 只保存 token 哈希。注册要求 UUID v4、token 和真实 Pi session id；心跳、收件、消息查询、发送和确认必须匹配当前实例、凭据、会话。`/new` 注册携带上一会话 ID 做比较更新，旧心跳不能把会话改回去。

离线只影响可达性，不释放身份。操作员确认要撤销旧进程后执行（在 controller 目录）：

```bash
go run ./cmd/controller agents get reviewer --url http://127.0.0.1:18741
go run ./cmd/controller agents release reviewer \
  --expected-runtime-id '<上一步实际返回的 runtime_id>' \
  --url http://127.0.0.1:18741
```

release 是按期望 UUID 比较的操作员动作，不是模型工具；不停止 Pi。释放后旧 UUID 被持久撤销，必须新启 Pi 才能用新 UUID 注册。旧数据库缺 UUID 的历史记录用显式 `--expected-runtime-id ''` 释放。Controller 和 Extension 需要一起升级；旧客户端缺 UUID/token 的写请求将失败。Controller 是本机协作服务，应继续监听 loopback；release HTTP 路径不是多用户权限系统。

## 通信工具与语义

先 `list_agents` 按 role/squad_id/status 发现，再 `get_agent` 确认目标。发送参数使用实际结果：

```text
send_message({
  "agent_id": "backend",
  "runtime_id": "<目标 UUID>",
  "runtime_session_id": "<目标 Pi session id>",
  "request_id": "review-note-001",
  "kind": "notice",
  "text": "请查看这条通知；无需执行任务。"
})
read_inbox({})
get_message({"message_id":"<返回的 message_id>"})
reply_message({"message_id":"<收到的 message_id>","text":"已收到"})
```

- `notice`：SSE 通知后立即检查收件箱，只做 Pi entry 去重标记与 UI 展示，不触发模型、不创建任务。完整正文用 read_inbox/get_message 读取。
- `ask`：将 kind 改为 ask；立即返回 message_id。目标忙时留在 Controller 队列；空闲且无待处理输入时才触发一次模型轮。该轮工具只允许针对原 ID 的 get_message/reply_message，禁止 bash、写文件、其它扩展工具与继续向其它 Agent 发问。不是 tools/model/skills 的角色配置功能。
- `reply_message`：按原消息冻结的双方绑定回复，不根据最近联系人猜测。一个原消息只接受一份成功回复；回复只展示，不再自动驱动模型。发问方用 read_inbox 看回答，回复记录含 reply_to。
- `request_id`：同一发送者实例/会话、同一 key 和相同参数重试返回同一 message_id；同 key 不同内容返回 409。网络结果不明时保留相同 key。离线失败后显式重试用新 key；reply_message 可传可选 request_id（默认 reply:<原 message_id>）。
- `stored` 仅为落库；`received` 为扩展收到；`recorded` 为展示/记录；`injection_requested` 仅表示申请模型输入；`replied` 以成功的显式回复为准。入站 ask 被用户介入或模型结束却没调用回复工具时标为 interrupted。调用 Pi 的 void API 不是模型完成证明。
- 目标已经 offline：保留 status=offline 的失败消息，工具 isError=true，不自动补投。目标未知或 UUID/session 已变：409/404，需重新发现后明确重发。当前只允许同 squad。
- 文本上限 64 KiB，默认队列有效期 10 分钟，每个目标绑定最多 32 条待处理消息；满队列拒绝。read_inbox 返回当前绑定最近 100 条；后台轮询只读待处理项。
- `/new` 或会话切换使旧绑定待处理消息失效，旧进程不能取新实例的收件箱；`/reload` 清理定时器，普通消息读取已有 session 去重标记。已经进入 injection_requested 的 ask 不自动重放；崩溃窗口需人工检查，不能声称 exactly-once 或模型已完成。

`/squad-inbox` 是人工只读入口。当前没有会话内 release 命令，也不在退出/超时时自动 release（避免把 reload 当作释放）。

新增 HTTP：`GET /messages/events`（SSE），`POST /agents/release`，`POST /messages/send`、`/messages/inbox`、`/messages/get`、`/messages/receipt`。消息请求中的 runtime_token 由扩展注入，不交给模型填写。纯文本通知、接收确认与消息状态保存在 Controller SQLite；不会往 `.agents/roles/` 写动态文件。

本轮只完成开发和编译/类型检查。旧 P0/发现测试的无凭据请求、同 ID 覆盖断言需要迁移为新契约，由 Claude 执行验收；之前 PASS 不能代替本次通信通过。

## SSE 下发与恢复

Controller 到 Pi 的低延迟通知走 `GET /messages/events`，消息发送、收件查询和 receipt 继续使用原 HTTP 接口。SSE 是 HTTP 长连接，不是替换整个 HTTP 协议。无需新增配置或安装依赖。

- 连接绑定 agent_id/runtime_id/runtime_session_id，运行凭据放在 `Authorization: Bearer` 请求头，不放 URL 或事件正文。Pi 用 fetch 消费 SSE；不依赖浏览器 EventSource。
- 消息事务提交后，Controller 给目标连接发 `event: inbox`，正文 `{}`。Pi 立即读取持久收件箱、去重、确认，再按 notice/ask/reply 的原规则处理。SSE 事件不携带消息正文，也不代表 received/replied。
- 每次连接先收到 inbox 通知，重新读取待处理记录；订阅先于初始通知建立，避免连接与查询间丢唤醒。通知可合并，队列容量为 1，不因慢连接阻塞发送事务。
- SSE 正常时每 15 秒补查；断线期间每秒补查并按约 0.5—15 秒退避加抖动重连。连接握手 5 秒超时，35 秒没有收到流数据则重连；Controller 每 10 秒发送保活注释，慢客户端写超时 5 秒。
- 身份错误或 binding_closed 停止该代 SSE 重连；接口 404 回退轮询，升级服务后 `/reload` 可重新连接。所有拉取仍校验实例凭据与会话，回退不能绕过身份校验。
- 每个 agent 只保留一个 SSE 订阅；新订阅替换旧订阅。`/new` 与显式 release 关闭旧服务端订阅；`/reload`/shutdown 中止客户端连接、计时器和重连等待。SSE 保活不更新 Registry last_seen，不替代 Pi 心跳。
- SSE 是可丢失的唤醒提示，不使用事件游标或 Last-Event-ID；恢复依据 SQLite 中尚未完成的消息。重连不会重发 send/reply，不会重放 injection_requested 的 ask，也不使 offline 消息变成可投递。
- ask 继续异步返回 ID，忙时留队列；agent_end 后主动唤醒收件处理，不依赖 15 秒补查。如果申请注入后、实际调用 Pi 前用户输入抢先进入，扩展用内部 deferred 回执将该消息退回 received 队列；已经调用 Pi 或结果未知的消息不走这条回退。notice/reply 不自动触发新模型轮。

用 `/squad-transport` 查看 mode（sse/polling/connecting/stopped）、wakeups、reconnects、last_reconcile_at 和 last_error。它只显示传输诊断，不显示凭据；mode=sse 不等于消息已经收到或模型已回复。

SSE 去掉原每秒轮询带来的调度等待，但本机实际端到端延迟以 Claude 验收的测量为准，不能将模型生成耗时算作传输延迟。当前第二阶段仍为 partial；新增传输必须重新验证已有 notice/reply 和 UUID 隔离。

### 断线提示

Controller 重启或连接中断时，fetch 可能返回 terminated/fetch failed。SSE、收件箱和心跳共享一次故障提示，网络错误不再按每次请求重复弹窗；各故障通道成功恢复后提示一次“控制器通信已恢复”。身份/协议错误仍单独显示，不因降噪跳过 UUID/token 校验或重试失败消息。`/squad-transport` 的 connection.failures 保留各通道最后错误；HTTP health 成功只能证明服务可达，不能代替 Pi 收件确认。新增提示行为需重载扩展后生效，验收仍由 Claude 完成。

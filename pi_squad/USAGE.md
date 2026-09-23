# Pi Squad 插件：配置与启动

这是 `pi_squad` 插件的使用说明。阶段验收仍看 `pi_squad_case/`；本文只写**已经能用**的配置和启动方式。

完成一项功能后，在同一次改动里更新本文，不要只改代码或阶段合同：

1. 在「当前能做什么」写上该项，并从「尚未实现」删掉。
2. 有新配置就补配置表和示例。
3. 启动方式变了就改「启动」里的命令。
4. 有新命令或工具就补「会话里怎么用」，写清它做什么、不做什么。
5. 还没落地的能力不要写成已可用。

## 插件是什么

本目录的插件是一个 Pi Extension，加上一个本机 Go Controller。

| 部分 | 路径 | 现在做什么 |
|------|------|------------|
| Extension | `pi_squad/extension/` | 按配置注册、心跳、列出 Agent；把角色提示交给当前 Pi |
| Controller | `pi_squad/controller/` | Gin HTTP + SQLite 登记身份和在线状态；Cobra 命令用 Resty 只读查看 |

它不启动 Pi，也不替你建 Herdr pane。每个 Pi 都要自己开，并用环境变量或配置文件声明自己是谁。

Registry 里的 `role` 只是路由标签。人格文本是配置文件里的 `role_prompt`，两者不是同一个字段。

## 当前能做什么

- 用 `PI_SQUAD_CONFIG` 指向一份 JSON，加载身份和角色提示。
- 不用配置文件时，用 `PI_SQUAD_AGENT_ID` / `PI_SQUAD_ROLE` / `PI_SQUAD_ID` 只做注册，不注入角色提示。
- `session_start` 向 Controller 注册；定时心跳；超时后列表里变为 `offline`。
- 同一 `agent_id` 再次启动会更新原记录，不会变成 `reviewer-2`。
- 会话内 `/squad-whoami` 查看本进程加载到的配置。
- 工具 `list_agents` 查询 Controller 里的 Agent。
- Controller 命令 `agents list` / `agents get` / `tui` 只读查看已运行的 Controller。`tui` 退出不停止服务。

## 尚未实现

不要在本文写这些的用法，除非代码已经落地：

- `get_agent` 工具（HTTP `GET /agents/{id}` 已有，扩展还没注册该工具）
- `send_message`、收件、回复
- `delegate_task` 和任务状态
- 自动启动或恢复 Pi / Herdr
- 把 Registry 的 `role` 当成 system prompt

## 启动

在仓库根目录操作。先起 Controller，再起 Pi。

### 1. Controller

```bash
cd pi_squad/controller
go run ./cmd/controller \
  -listen 127.0.0.1:18741 \
  -db /tmp/pi_squad.sqlite \
  -heartbeat-timeout 15s
```

等价环境变量：`PI_SQUAD_LISTEN`、`PI_SQUAD_DB`、`PI_SQUAD_HEARTBEAT_TIMEOUT`。`go run ./cmd/controller serve` 相同。开发约束见 [controller/AGENTS.md](controller/AGENTS.md)。

确认：

```bash
curl -s http://127.0.0.1:18741/health
```

应返回 `{"status":"ok"}`。也可以：

```bash
go run ./cmd/controller agents list --url http://127.0.0.1:18741
go run ./cmd/controller tui --url http://127.0.0.1:18741
```

`agents` 和 `tui` 只读，不打开数据库。`tui` 里按 `q` 只退出观察，不停止 Controller。API 细节见 [controller/README.md](controller/README.md)。

### 2. 写角色配置

推荐一份角色一个 JSON 文件。`PI_SQUAD_CONFIG` 的值是这个文件的路径；不同 Pi 用不同路径，就加载不同配置。

`configs/reviewer.json`：

```json
{
  "agent_id": "reviewer",
  "role": "reviewer",
  "squad_id": "alpha",
  "role_prompt": "You are the reviewer. Do not edit files. Report findings with file and line."
}
```

`configs/backend.json`：

```json
{
  "agent_id": "backend",
  "role": "backend",
  "squad_id": "alpha",
  "role_prompt": "You are the backend engineer. Change only the files the task names."
}
```

| 字段 | 必填 | 作用 |
|------|------|------|
| `agent_id` | 是 | 逻辑身份，重复注册的键 |
| `role` | 是 | 注册表里的角色标签，不是系统提示 |
| `squad_id` | 是 | 小队 id |
| `role_prompt` | 否 | 进程启动时读入内存。每次用户提交新提示时追加到该轮系统提示，不写入会话文件 |
| `controller_url` | 否 | 默认 `http://127.0.0.1:18741`。进程环境里的 `PI_SQUAD_CONTROLLER_URL` 优先 |
| `heartbeat_interval_ms` | 否 | 默认 `5000`。`PI_SQUAD_HEARTBEAT_INTERVAL_MS` 优先 |
| `space_id` / `pane_id` / `herdr_session_id` | 否 | 没有对应环境变量时才用文件里的值 |

文件必须是 JSON 对象，不超过 64 KiB。`role_prompt` 如果出现，必须是字符串。

设置了 `PI_SQUAD_CONFIG` 之后，`agent_id`、`role`、`squad_id`、`role_prompt` **只从文件读**。同名身份环境变量不会覆盖它们。Controller 地址、心跳、Herdr pane 仍优先用进程环境，因为它们描述的是这次进程开在哪，不是人格。

### 3. 启动带配置的 Pi

每个角色一个终端。不要让 Controller 或插件去 spawn。

```bash
# 终端 A
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_CONFIG="$PWD/configs/reviewer.json"
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"

# 终端 B
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_CONFIG="$PWD/configs/backend.json"
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

`--no-extensions` 关掉其它已安装扩展，避免和本次实验混在一起。`-e` 仍会加载这里的插件。

Herdr 只提供位置，不提供身份。pane 要自己建好再启动：

```bash
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_CONFIG="$PWD/configs/reviewer.json"
export HERDR_WORKSPACE_ID=... HERDR_PANE_ID=...
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

`HERDR_WORKSPACE_ID` 写入 `space_id`，`HERDR_PANE_ID` 写入 `pane_id`。`herdr_session_id` 默认空；只有设置了 `PI_SQUAD_HERDR_SESSION_ID`、`HERDR_SESSION_NAME` 或 `HERDR_SESSION` 才上报。

### 4. 确认

在 Pi 里执行：

```text
/squad-whoami
```

应看到 `source` 为 `config`，以及文件里的 `agent_id`、`role`、`role_prompt`。`injected` 在你发出第一句话之前是 false：角色提示在 `before_agent_start` 追加，不是进程刚起来就写进系统提示。

另一个终端：

```bash
curl -s http://127.0.0.1:18741/agents | python3 -m json.tool
```

应看到两个 `status` 为 `online` 的记录。`role_prompt` 不会出现在这条响应里。停掉其中一个 Pi，等待超过 `-heartbeat-timeout` 后再查，该记录应为 `offline`，另一个仍为 `online`。

## 只注册、不注入角色

不需要角色提示时，不要设 `PI_SQUAD_CONFIG`：

```bash
export PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:18741
export PI_SQUAD_AGENT_ID=reviewer PI_SQUAD_ROLE=reviewer PI_SQUAD_ID=alpha
pi --no-extensions -e "$PWD/pi_squad/extension/index.ts"
```

三个身份变量缺任何一个，插件会警告并跳过注册。`list_agents` 和 `/squad-whoami` 仍可用；后者会列出缺哪些变量。

| 变量 | 何时需要 | 含义 |
|------|----------|------|
| `PI_SQUAD_CONFIG` | 要角色提示时 | JSON 文件路径 |
| `PI_SQUAD_AGENT_ID` | 没设配置文件时 | 逻辑身份 |
| `PI_SQUAD_ROLE` | 没设配置文件时 | 注册表角色标签 |
| `PI_SQUAD_ID` | 没设配置文件时 | 小队 id |
| `PI_SQUAD_CONTROLLER_URL` | 否 | 默认 `http://127.0.0.1:18741` |
| `PI_SQUAD_HEARTBEAT_INTERVAL_MS` | 否 | 默认 `5000` |
| `HERDR_WORKSPACE_ID` / `PI_SQUAD_SPACE_ID` | 否 | `space_id` |
| `HERDR_PANE_ID` / `PI_SQUAD_PANE_ID` | 否 | `pane_id` |
| `PI_SQUAD_HERDR_SESSION_ID` / `HERDR_SESSION_NAME` / `HERDR_SESSION` | 否 | `herdr_session_id`；都没有则空 |

`runtime_session_id` 只来自 Pi 的 `getSessionId()`。拿不到就留空，不伪造。`/new` 会停掉旧心跳，再用同一个 `agent_id` 注册新会话。

## 会话里怎么用

| 入口 | 作用 |
|------|------|
| `/squad-whoami` | 打印本进程加载的配置、是否已注册、角色提示是否已进入本轮系统提示 |
| `list_agents` | 向 Controller 列 Agent。可选 `agent_id`、`role`、`squad_id`、`status`（`online` 或 `offline`） |

`list_agents` 只查 Controller，不扫描终端或 Herdr pane。

## 安装到日常直接启动的 Pi

本地开发无需先发布 npm。一次性登记扩展入口：

```bash
pi install /Users/logo/self_repo/pi_case/pi_squad/extension/index.ts
pi list
```

默认写入用户设置 `~/.pi/agent/settings.json`，保存源码路径而不复制文件。之后直接启动 `pi` 即可加载；修改源码后重启或 `/reload`。仅当前项目使用时，在项目根目录执行 `pi install -l /Users/logo/self_repo/pi_case/pi_squad/extension/index.ts`。

Controller 仍需单独启动，身份与角色配置仍需提供。例如已有 `configs/reviewer.json` 时：

```bash
cd /Users/logo/self_repo/pi_case
PI_SQUAD_CONFIG="$PWD/configs/reviewer.json" pi
```

此启动方式不要带 `--no-extensions`，也不再需要 `-e`。未提供身份配置时，全局加载的 Squad 会警告并跳过注册。

将来要以目录或 npm 包分发，可以在 `pi_squad/package.json` 声明 `"pi": {"extensions": ["./extension/index.ts"]}`；当前没有该清单，优先安装上述入口文件。目录名 `extension/` 是单数，不是 Pi 约定的 `extensions/`。

## 查看角色注入与模型调用链

使用 `pi-trace-extension`。2026-09-24 本机 `pi list` 已确认安装，无需重复安装；新环境执行 `pi install npm:pi-trace-extension`。

日常模式按上一节直接启动 `pi`，自动加载已安装扩展。若继续做隔离实验，需显式加载 Squad 和 Trace：

```bash
cd /Users/logo/self_repo/pi_case
PI_SQUAD_CONFIG="$PWD/configs/reviewer.json" \
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

本机有 `pi` 时：

```bash
node pi_squad_case/phase_00_identity/verify-config-pi.mjs
```

它会自起临时 Controller 和三个 `pi --mode rpc`：两份不同配置应注册成不同身份并注入各自的角色提示；不设 `PI_SQUAD_CONFIG` 的进程不应注册。

不需要 `pi` 时，只核对 Controller：

```bash
./pi_squad_case/phase_00_identity/smoke.sh
```

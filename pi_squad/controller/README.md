# Pi Squad Controller

Go 控制面。开发约束在 [AGENTS.md](AGENTS.md)。Extension 不使用这里的库。

`serve` 写 SQLite 并用 Gin 提供 HTTP。`agents` 和 `tui` 用 Resty 读已经运行的 Controller，不打开数据库。退出 `tui` 不会停止 `serve`。

## 运行

```bash
cd pi_squad/controller
go run ./cmd/controller \
  -listen 127.0.0.1:18741 \
  -db /tmp/pi_squad.sqlite \
  -heartbeat-timeout 15s
```

`serve` 子命令等价。配置优先级是 flag、环境变量、`--config` 文件、默认值。环境变量：`PI_SQUAD_LISTEN`、`PI_SQUAD_DB`、`PI_SQUAD_HEARTBEAT_TIMEOUT`。

## 查看

Controller 已经在听时：

```bash
go run ./cmd/controller agents list --url http://127.0.0.1:18741
go run ./cmd/controller agents get reviewer --url http://127.0.0.1:18741
go run ./cmd/controller tui --url http://127.0.0.1:18741
```

`--url` 也可由 `PI_SQUAD_CONTROLLER_URL` 提供。`tui` 是只读表格，`q` 退出。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/agents/register` | 按 `agent_id` upsert，置 `online` |
| `POST` | `/agents/heartbeat` | 刷新 `last_seen`；未知 id 返回 404 |
| `GET` | `/agents` | 列表；可选 `agent_id` / `role` / `squad_id` / `status` |
| `GET` | `/agents/:id` | 单个 Agent |
| `GET` | `/health` | 存活检查 |

`status` 由 `last_seen` 与 `-heartbeat-timeout` 在读取时计算。Controller 重启后身份行仍在；超过超时窗口的记录为 `offline`，直到新心跳。

## 角色与运行信息

新版 Extension 的 `role` 来自 Markdown frontmatter 的 name；`role_description` 来自 description。注册请求和返回记录增加可选 `cwd`（非空时必须为绝对路径）、`runtime_id`（非空时必须为 UUID v4）、`role_description`。旧客户端仍可省略，历史数据库自动加列而不伪造历史值。Markdown 正文不进 Registry。

`runtime_id` 标识一次 Pi 进程运行，`runtime_session_id` 标识其中的 Pi 会话。主键仍为 agent_id；同 id 注册更新这三个新属性，心跳保留它们。该 UUID 尚不作为租约或鉴权凭据，也不引入历史记录。CLI JSON 查询返回新字段；TUI 选中行下显示启动 cwd、UUID 和角色简介。

## 日志与面板

`serve` 仅运行 HTTP 服务；成功心跳不逐条打印日志，启动/注册/内部错误仍记录。启动日志给出独立 `tui --url` 入口。面板端口必须与实际服务端口一致；退出只读面板不停止服务。详见 `../USAGE.md` 的“服务日志与 Dashboard”。


运行实例与通信升级：注册要求 runtime_id/runtime_token/runtime_session_id；同 agent_id 不再被不同进程覆盖。`agents release <id> --expected-runtime-id <uuid>` 显式撤销持有者（不停止进程）。新增 HTTP 消息 send/inbox/get/receipt 接口；协议、工具和迁移步骤以 [USAGE](../USAGE.md) 为准。本轮通信尚待真实 Pi 验收。

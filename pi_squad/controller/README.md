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

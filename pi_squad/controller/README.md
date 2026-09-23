# Pi Squad Controller（P0）

单进程 HTTP + SQLite Agent Registry。不 spawn Pi / Herdr，不路由消息，不存任务。

## 运行

```bash
cd pi_squad/controller
go run ./cmd/controller \
  -listen 127.0.0.1:18741 \
  -db /tmp/pi_squad.sqlite \
  -heartbeat-timeout 15s
```

环境变量可覆盖同名默认值：`PI_SQUAD_LISTEN`、`PI_SQUAD_DB`、`PI_SQUAD_HEARTBEAT_TIMEOUT`。

默认监听 `http://127.0.0.1:18741`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/agents/register` | 按 `agent_id` upsert，置 `online` |
| `POST` | `/agents/heartbeat` | 刷新 `last_seen`；未知 id 返回 404 |
| `GET` | `/agents` | 列表；可选 `agent_id` / `role` / `squad_id` / `status` |
| `GET` | `/agents/{id}` | 单个 Agent |
| `GET` | `/health` | 存活检查 |

`status` 由 `last_seen` 与 `-heartbeat-timeout` **在读取时**计算。Controller 重启后身份行仍在；超过超时窗口的记录为 `offline`，直到新心跳。

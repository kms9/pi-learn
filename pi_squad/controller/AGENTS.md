# Controller 开发规范

本目录是 Pi Squad 的 Go 控制面。这些库只允许出现在 `pi_squad/controller/`。Pi Extension 仍是 TypeScript，不要把 Gin、Resty、Viper、Cobra 或 Bubble Tea 引进 `pi_squad/extension/`。

## 语言与模块

- Go `1.27.0`。`go.mod` 的 `go` 行保持 `1.27.0`。
- Module：`github.com/kms9/pi-learn/pi_squad/controller`。

## 技术栈

版本以 2026-09-24 核对的 tag 为准。升级前先改本文件，再改 `go.mod`。

| 职责 | 模块 | 版本 | 不使用 |
|------|------|------|--------|
| HTTP 服务 | `github.com/gin-gonic/gin` | `v1.12.0` | 标准库 `ServeMux` 再包一层路由 |
| HTTP 客户端 | `github.com/go-resty/resty/v2` | `v2.17.2` | `github.com/go-resty/resty`（v1） |
| 配置 | `github.com/spf13/viper` | `v1.21.0` | 手写环境变量解析作为主路径 |
| 命令 | `github.com/spf13/cobra` | `v1.10.2` | 标准库 `flag` 作为进程入口 |
| TUI 循环 | `github.com/charmbracelet/bubbletea` | `v1.3.10` | `charm.land/bubbletea/v2` |
| TUI 组件 | `github.com/charmbracelet/bubbles` | `v1.0.0` | `charm.land/bubbles/v2` |
| TUI 样式 | `github.com/charmbracelet/lipgloss` | `v1.1.0` | `charm.land/lipgloss/v2` |

TUI 对齐 `/Users/logo/self_repo/herdr_case/herdr-dashboard` 正在使用的 Charm v1，不跟 Charm v2 模块路径。

SQLite 仍用 `modernc.org/sqlite`。身份、心跳和在线状态留在 `agent/`。HTTP 框架不承载这些规则。

## 进程怎么分工

一个二进制，两条路径：

- `serve` 持有 SQLite，用 Gin 提供 HTTP。这是唯一写库的命令。
- `agents` 和 `tui` 用 Resty 访问已经运行的 Controller。它们不打开数据库，退出也不停止 `serve` 或 Pi。

HTTP 路径是 Extension 的契约，换框架时保持不变：

- `POST /agents/register`
- `POST /agents/heartbeat`
- `GET /agents`
- `GET /agents/:id`
- `GET /health`

成功和错误 JSON 的字段名保持现有形状。`role_prompt` 不进 Registry。

## 配置优先级

Viper 读取，Cobra 只声明 flag。高优先级覆盖低优先级：

1. 显式 flag
2. 环境变量
3. `--config` 指向的文件
4. 默认值

| 键 | flag | 环境变量 | 默认 |
|----|------|----------|------|
| `listen` | `--listen` | `PI_SQUAD_LISTEN` | `127.0.0.1:18741` |
| `db` | `--db` | `PI_SQUAD_DB` | `pi_squad.sqlite` |
| `heartbeat-timeout` | `--heartbeat-timeout` | `PI_SQUAD_HEARTBEAT_TIMEOUT` | `15s` |
| `url` | `--url` | `PI_SQUAD_CONTROLLER_URL` | `http://127.0.0.1:18741` |

`url` 只给 Resty 客户端。`serve` 不拿它当监听地址。未传 `--config` 时不搜索配置文件。

无子命令时等同 `serve`，以保持 `go run ./cmd/controller -listen ... -db ... -heartbeat-timeout ...`。

## 改动约束

- 不在 Controller 里 spawn Pi 或 Herdr。
- TUI 只读。`q` 或 Ctrl+C 只退出观察进程。
- 新的可用命令要同时写进 `pi_squad/USAGE.md`。未实现的命令不要写进使用说明。

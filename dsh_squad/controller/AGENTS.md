# Controller 开发规范（DSH Squad）

本目录是 DSH Squad 的 Go 控制面。2026-10-19 决策 D1：从 `pi_squad/controller` 复制过来后独立演进，不与 `pi_squad` 共用；`pi_squad` 不再维护。唯一支持的宿主是 `dsh/0.2.1-rc.2+ds-bot/ae63b45`（`project.HostProfile`，D9）。

Gin、Resty、Viper、Cobra、Bubble Tea 只允许出现在本目录。Adapter（`dsh_squad/adapter`）和客户端插件是 JavaScript，不引入这些库。

## 语言与模块

- Go `1.27.0`，`go.mod` 的 `go` 行保持 `1.27.0`。
- Module：`github.com/kms9/pi-learn/dsh_squad/controller`。

## 技术栈

| 职责 | 模块 | 版本 |
|------|------|------|
| HTTP 服务 | `github.com/gin-gonic/gin` | `v1.12.0` |
| HTTP 客户端 | `github.com/go-resty/resty/v2` | `v2.17.2` |
| 配置 | `github.com/spf13/viper` | `v1.21.0` |
| 命令 | `github.com/spf13/cobra` | `v1.10.2` |
| TUI | `github.com/charmbracelet/bubbletea` / `bubbles` / `lipgloss` | `v1.3.10` / `v1.0.0` / `v1.1.0` |
| SQLite | `modernc.org/sqlite` | 见 `go.mod` |

## 进程与项目

- `serve` 从 cwd 或 `--project-root` 找最近的 `.agents/dshsquad/`，持进程锁，数据库默认 `.agents/dshsquad/.runtime/state.sqlite`，监听 `127.0.0.1:0`，把 endpoint 原子写进 `.runtime/controller.json`。一个项目目录只有一个 Controller（D4）。
- 环境变量前缀 `DSH_SQUAD_`（如 `DSH_SQUAD_LISTEN`、`DSH_SQUAD_CONTROLLER_URL`）。优先级：flag > 环境变量 > `--config` 文件 > 默认值。
- 协议 `squad/3`（D3），写请求带 `X-Squad-Protocol`、`X-Squad-Controller`；runtime 再带 `X-Squad-Agent`、`X-Squad-Binding`。契约见 `dsh_squad/protocol/README.md`。
- 不在 Controller 里启动 DSH 宿主；配对启动由 `dsh_squad/deploy` 负责。

## 改动约束

- 业务 Task 没有固定截止时间（2026-10-04 决策）；lease、心跳是通信层的，不能据此判定业务结果。
- 新的可用命令、配置和接口同步写进 `dsh_squad/USAGE.md`；没落地的不写。
- 中间阶段要求 `go build ./... && go vet ./... && go test ./...` 通过（`dsh_squad/scripts/check.sh`）。

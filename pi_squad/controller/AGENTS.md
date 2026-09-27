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

## 阶段 04 目标变更（未实现）

上面的默认值与 HTTP 清单描述当前实际行为。阶段 04（4a 的 M1）落地时按 `pi_squad_case/04-team-orchestration/` 修改，届时先改本文件再改代码：

- 数据库改为 Project 的 `.agents/pisquad/.runtime/state.sqlite`；`serve` 持真实进程锁，动态绑定 `127.0.0.1:0` 并原子写 `.runtime/controller.json`。客户端按 discovery 文件与 `/health` 的 project/protocol/controller 校验连接，不回退到固定 `18741`。
- 保留 `/health` 与现有查询兼容面；新调度写接口放在协议 `pi-squad/2` 的 `/v2/...`（技术设计 D08）。
- 业务代码按技术设计 D01 分到 `project/`、`task/`、`scheduler/`、`recovery/`、`projection/`，HTTP handler 仍只做薄适配。
- TUI 仍只读；命令预览只展示，实际执行走显式提交的操作接口。

## 改动约束

- 不在 Controller 里 spawn Pi 或 Herdr。
- TUI 只读。`q` 或 Ctrl+C 只退出观察进程。
- 新的可用命令要同时写进 `pi_squad/USAGE.md`。未实现的命令不要写进使用说明。

## 阶段 04 实施中覆盖（2026-09-27）

当前开发开始切换 Project runtime；以下约束优先于上文旧 P0 默认：`serve` 从 cwd/`--project-root` 发现最近 Project，默认监听 `127.0.0.1:0`，数据库默认 Project `.runtime/state.sqlite`，URL 不设固定默认。显式 `--db` 仅用于隔离验收，仍持对应 Project 进程锁；不得启动第二个同 Project Controller。新增 `--max-parallel-tasks`（默认 2）、`--lease-ttl`（默认 30s，续约 10s）、`--project-root`，Viper 按原优先级读取；配置 direct.allowed_callers/allowed_targets 默认空，direct.allowed_tools 默认 read/grep/find/ls。30s 是本轮实现可查询默认，不表示 TTL 后可释放资源。

按用户最新要求：不新增或运行单元测试，先完成全部需求开发，再统一整体集成验收；编译和类型检查可在开发期间运行，不能据此标验收 PASS。

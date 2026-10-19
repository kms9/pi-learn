# TheBrain Agent Skills

> 目标：把 TheBrain 从手动知识管理工具，推进为可通过 Go CLI 驱动、由两套 AI Skill 使用的个人知识与学习系统。
>
> 状态（2026-10-18）：**资料基线已同步；本地 API 尚未联通实机；CLI 先做只读 MVP；写操作与 Skill 尚未实机验收。**

## 项目边界与核心思路

`TheBrain Desktop → Local API → brainctl (Go CLI) → Skills → Agent / 用户`

- TheBrain：Thought、父子/Jump/Sibling 关系、Notes、Attachments、Tags、Types 的**事实源**。
- brainctl：唯一 HTTP 适配层；操作契约、ID、错误、审核日志和写入安全策略在这一层收敛。
- thebrain-knowledge：捕获、澄清、去重、建模、连接、整理、审计知识。
- thebrain-learning：提出学习目标、检索知识、诊断差距、主动回忆、检验与复习。
- 外部学习状态（预留 SQLite）：掌握度、答题证据、复习时间和会话；不得混进事实性知识节点。

## 优先阅读

1. [TheBrain 使用最佳实践](docs/KNOWLEDGE-BEST-PRACTICES.md)：来自 Tutorials 和 Big Thinkers 的可执行规则（注明是我们的归纳）。
2. [架构与边界](docs/ARCHITECTURE.md)：数据职责、CLI、两套 Skill 与安全政策。
3. [本地联通手册](docs/LOCAL-CONNECTIVITY.md)：Mac 上连接 TheBrain 的明确步骤。
4. [计划与验收](docs/ROADMAP-AND-ACCEPTANCE.md)：里程碑、可执行测试、阻塞项。
5. [资料与证据登记](docs/SOURCES-AND-DECISIONS.md)：官方链接、已验证事实、待验证事项。
6. [Local API 开发参考](docs/api/TheBrain-Local-API-开发参考.md)、[完整原始规范](docs/api/docs.json)、[端点索引](docs/api/TheBrain-Local-API-endpoints.json)。
7. [知识维护 Skill](skills/thebrain-knowledge/SKILL.md) 与 [学习 Skill](skills/thebrain-learning/SKILL.md)。

## 当前可以运行：只读 Go CLI

环境：macOS、TheBrain 桌面程序已经启动、已登录，Go 1.22+。

```bash
cd projects/thebrain-agent-skills
export THEBRAIN_API_URL=http://127.0.0.1:11522
read -s "THEBRAIN_API_KEY?Local API Key: "; echo
export THEBRAIN_API_KEY
go run ./cmd/brainctl doctor
go run ./cmd/brainctl brain list
go run ./cmd/brainctl app state
```

API Key 由桌面端 `Settings > User > Local API Key` 获取。连接默认限制本机回环地址；CLI 不实现写操作，也不会把密钥打印到日志。请勿将 Key、含私人 Thought/Note 内容的输出、真实 Brain 导出加入 GitHub。

其他只读命令：
- `go run ./cmd/brainctl thought get --brain-id UUID --id UUID`
- `go run ./cmd/brainctl thought graph --brain-id UUID --id UUID`
- `go run ./cmd/brainctl note get --brain-id UUID --id UUID`
- `go run ./cmd/brainctl search --brain-id UUID --query "agent"`

运行 `go test ./...` 只验证模拟服务下的客户端行为，**不等于本机连接成功**。

## 本项目与 GitHub 位置

当前暂存在 `kms9/pi-learn` 的独立开发分支内，目录 `projects/thebrain-agent-skills/`。这是隔离的过渡位置，既不修改 Pi Squad 的正式主线，也不代表未来必须依附该仓库。待有权限创建独立仓库时，建议迁移到 `kms9/thebrain-agent-skills`。

严禁误把 PR 分支 / mock 测试通过写成“真实 TheBrain 已验证”。

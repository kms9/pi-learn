# Agent 作业规范 · TheBrain Agent Skills

> 本文件仅适用于 `projects/thebrain-agent-skills/` 项目边界。项目目前位于 `pi-learn` 开发分支，不要改动上层 Pi Squad / DSH 文件。

## 目标与原则

1. 每次任务先阅读 `README.md`、`docs/ROADMAP-AND-ACCEPTANCE.md` 和 `docs/SOURCES-AND-DECISIONS.md`。
2. API 事实以 `docs/api/docs.json` 为准。`docs/api/TheBrain-Local-API-endpoints.json` 为导出索引。不要凭推测构造参数。
3. 命令、枚举、API 名保持英文；文档与验收记录使用中文。
4. 严格区分 `spec-confirmed` / `mock-tested` / `local-tested` / `unknown`。
5. macOS 本地服务不能从远程 ChatGPT/GitHub 直接访问。**不得伪称已经联通用户机器**。
6. 所有 GitHub 文件不得包含 API Key、用户账号、私人笔记正文、完整私人 Brain 导出。
7. P0 只读，暂不实现 Brain/Thought/Link/Note/Access 的写入；M2 前所有危险命令无默认执行权限。
8. 下一阶段实现写入必须 `preview → approve/apply → readback verify → audit`，并显式指定 Brain ID；失败拒绝静默重试。
9. 本地证据一律脱敏；产品验收不得用 mocked HTTP 成功替代。
10. 任何新决策写回 `docs/SOURCES-AND-DECISIONS.md`；同步更新 `docs/ROADMAP-AND-ACCEPTANCE.md` 和 `README.md` 状态。

## 开发命令

`go test ./...`，`go run ./cmd/brainctl doctor`，`go run ./cmd/brainctl brain list`。

先通过 mock 测试，再邀请用户在自己的 Mac 上运行真实测试；保留可复现步骤和错误证据。

## 两套 Skill

- `skills/thebrain-knowledge/SKILL.md`：整理知识、复用节点、建立有出处的连接。
- `skills/thebrain-learning/SKILL.md`：将目标 Thought 转化为学习路径、练习与下一轮复习。

两个 Skill 共享 CLI 读取层，但彼此独立；学习进度保存在 TheBrain 外部。

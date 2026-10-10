---
title: 2026-10-04 按当前实现更新 Pi Squad README 与 USAGE
type: session
status: active
created: 2026-10-04
updated: 2026-10-04
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-10-04 按当前实现更新 Pi Squad README 与 USAGE

## 用户要做什么

基于 `pi_squad/` 当前插件实现更新说明文档 README 和使用/实现说明 USAGE。

## 达成了什么

- 结论: [README](../../pi_squad/README.md) 从 P0 身份模块说明改为 Project runtime v2 总览，覆盖当前能力、精确 Pi 1.0.1/TUI 范围、使用入口、实现导航和已知限制。
- [USAGE](../../pi_squad/USAGE.md) 按安装、完整三角色配置、启动、配置参考、Pi 命令、模型工具、许可/验收、恢复、诊断与迁移重新组织。示例包含 Role、Team、Workflow、数据和 instructions，不依赖 Git 忽略的集成夹具。
- 修正阶段 04“尚未全量通过”的过期表述；将已记录的 89/89 场景结果与额外 provider/native binary 的兼容覆盖限制分开说明，不把历史验收写成通用生产保证。
- 对照实际 parser/CLI 明确 Pi run 使用 default_workflow、CLI 可选 workflow；Pi call 单个 write 与 CLI 可重复 write；正式 ask 仅查询/回复；recover 只接受已有 attempt/evidence 引用；管理预览、CAS、精确结果 hash 和 Leader rebind 的区别。
- 保留实际限制：accepted 后固定 120 秒截止、child 未 yield 的阻塞风险、仅数字 checker、空闲 Pi shell 与本地凭据边界、历史与长期运行限制。相关未决沿用代码审核的 Q25/Q26，本次没有实现修复。

依据为 `extension/project.ts`、`doctor.ts`、`squad-commands.ts`、`control-tools.ts`、`task-tools.ts`、`team-messaging.ts`、`execution-gate.ts`、`managed-files.ts`，以及 Controller 的 `cli/`、`config/config.go`、`project/config.go`、`scheduler/` 和阶段 04/兼容记录。

### 本次校验

- 当前源码 `go build -o /tmp/pi-squad-docs-20261004-controller ./cmd/controller` 通过。
- 两份文档 45 个本地链接/锚点与代码围栏检查通过；两段 JSON 配置成功解析。
- 从文档示例构造临时 Project，当前 CLI doctor 识别 3 Role/1 Team，实际 Pi 1.0.1 检查 errors=[]；未启动 Controller/模型、未创建 `.runtime`，没有 probe 时 formal_execution_ready=false 符合说明。临时目录检查后移除。
- task、operate、agents release、run、doctor、migrate 的六组 help 参数与文档一致；schema 的 x-contracts.acceptance 存在。
- `git diff --check` 通过。没有改产品源码、上游 submodule 或运行新的模型/单元验收；保留工作区已有代码审核 wiki 改动，未提交。

## 写回了哪些 wiki 页

- 页面: 本页、[[sessions/_index|会话索引]]、`docs/index.md`、`docs/log.md`。

## 未决

- 问题: [[questions/open-questions|开放问题]] Q25/Q26 继续保留；当前文档标出实现边界，不代替对应修复。

## 相关页面

- 概念: [[concepts/pi-squad|Pi Squad]]
- 前序: [[sessions/2026-10-04-pi-squad-phase04-continuation|阶段 04 实施与验收]]
- 审核: [[sessions/2026-10-04-pi-squad-phase04-code-review|阶段 04 代码审核与评估]]
- 规格: [当前主 spec](../../openspec/specs/)、[阶段 04 归档](../../openspec/changes/archive/2026-10-04-pi-squad-team-orchestration/)

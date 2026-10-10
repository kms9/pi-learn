## Why

`pi-dev` 已更新到 coding-agent 1.0.1，但当前系统 `pi` 仍为 1.0.0。Pi Squad 现有代码依赖安装目录的声明文件做能力判定，尚未显式适配新版工具暴露、嵌套调用与 `terminate` 收尾；请求证据也可能把历史消息中的任务文本当成当前有效上下文。必须先明确可支持的宿主和正式执行边界，再让这次适配可以被真实运行验证。

本 change 承接未归档的 `pi-squad-team-orchestration` 已实现代码，不替代其调度、租约、恢复及 89 场景验收。基线为 `pi-dev@4c6fb7cfe8c538a668726f6f8b3554098c39faee` 的 1.0.1 公共 API。

## What Changes

- P0：固定 `pi-coding-agent/1.0.1` 兼容 profile，启动前核对实际宿主版本、公开 API 与执行模式。**BREAKING**：Squad 正式激活仅支持 TUI；RPC、JSON、print 在注册及派发前明确拒绝，普通 Pi 继续可用。
- P0：状态修改工具使用 `model-only` 暴露和 `sequential` 执行；拦截正式片段中嵌套控制调用；派发前核对所需工具确实注册、可直接声明且实际启用，缺项时拒绝注入。
- P1 可靠收尾：成功提交结果、yield、clarify、clarification answer、Leader decision 和正式 ask reply 返回 `terminate: true`；失败不终止。保留 Controller 的 `result_proposed → agent_settled → accepted` 确认，不把 `terminate` 当完成确认。
- P1 可靠收尾：延后 settled 回调携带 binding、attempt、segment、generation 和 outcome 快照，提交前重新核对 idle、pending 与中断边界；混合工具批次遵守 Pi 的“全部结果都 terminate 才终止”规则。
- P1 请求证据：记录 canonical 当前 system sections/tools 与按提供商格式解析的有效请求 system/tools；匹配完整任务身份及哈希，未知格式明确标记 `unknown`。生产 hook 的局部观察和末位验收 observer 分开记录，不保存原始请求或凭证。
- P1 能力检测：安装元数据与声明扫描只作为诊断，公共版本/profile 检查与真实事件探针分层；doctor 支持指定 Pi 可执行文件，旧探针不能宣称新 profile 已就绪。
- 更新 `pi_squad/USAGE.md`、阶段 04 的可复用兼容探针与 wiki；用实际 1.0.1、三个角色、Controller 和 Dashboard 做可见集成验收。

## Capabilities

### New Capabilities

- `squad-pi-host-compatibility`: Pi 1.0.1 的 TUI 激活、工具权限、可靠收尾、有效请求证据和宿主能力探针契约。

### Modified Capabilities

无已发布 main spec 可修改；现有阶段 04 change 仍独立保留，本 change 明确补充宿主兼容契约。

## Impact

- Extension：`doctor.ts`、`invocation.ts`、`execution-gate.ts`、控制工具、消息工具、上下文/证据与命令诊断。
- Controller：`project/doctor.go`、`project/probe.go`、`cli/doctor.go`；不修改调度或数据库状态机。
- 文档：`pi_squad/USAGE.md`、`pi_squad_case/04-team-orchestration/` 的兼容验收入口与 wiki。
- 不改上游 `pi-dev/`，不迁移 Durable，不新增 Codemode 产品能力，不做 UI 重设计、输出 schema/annotations 或 SDK/RPC 正式执行支持。本次不新增或运行单元测试；编译和类型检查仅为开发检查，真实运行另行验收。

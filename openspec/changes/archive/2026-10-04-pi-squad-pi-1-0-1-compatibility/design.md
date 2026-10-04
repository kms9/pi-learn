## Context

动机见 `proposal.md`。`extension/invocation.ts` 已有 generation、binding、segment、输入回执和 stopped 栅栏；Go Controller 的完成确认与资源释放不能旁路。`setActiveTools` 当前静默过滤缺失工具；`doctor.ts` 和 Go doctor 当前把内部声明文件扫描当能力门槛；`payloadEvidence` 和 schema 1 probe 使用原始请求全文的包含关系。`agent_settled` 的延后回调目前只比较 current/binding 对象，读取的是共享 outcome。

Pi 1.0.1 公共接口已提供 `ctx.mode`、tool exposure、executionMode、嵌套调用的 `parentToolCallId`、`terminate`、`context_with_system` 与 pi-ai 的 canonical 投影。实际安装尚是 1.0.0。上游只读；现有未归档阶段 04 工作、用户正在运行的服务与已有数据库不得被本轮覆盖。

## Goals / Non-Goals

**Goals:** 将宿主检查、执行护栏和观察证据分层；保留原协议及状态机；通过同一 profile 关联 TS 与 Go 诊断，避免证据来源与实际安装混淆。

**Non-Goals:** 不新增数据库 schema、租约/调度机制、Durable runtime、RPC 正式执行或 UI redesign。上下文证据是诊断和验收材料，不增加“解析失败就接受任务”的执行旁路，也不把未知提供商格式作为正式就绪证明。

## Decisions

### D01 固定可验证 profile，激活前检查

在 `extension/doctor.ts` 定义 `pi-coding-agent/1.0.1` 的精确版本、必需公开 API 和观察事件清单；Go `project/doctor.go` 使用相同 profile ID。版本、TUI 模式、API 函数存在是注册前检查，`.d.ts` 为可选安装诊断。事件语义只能由运行探针证明，不能由字符串存在推导。

宿主诊断包含实际版本、mode、Node 版本、解析后的 Pi 入口路径与入口文件 SHA-256；Go doctor 新增 `--pi-binary`，使用有限超时执行 `--version`，解析 npm 元数据或把安装标为 executable，匹配探针的路径/哈希和 profile。缺失源码 commit 保持 `unknown`。初次拒绝恢复普通工具；已有 reservation 的 reload 失败保持原冻结规则。非 TUI 输入不再参与 Squad 的 handoff/guidance；正式片段意外出现 RPC 输入明确拦截。

不使用版本下界推断未来兼容，也不修改全局 Pi 或已有进程。实施验收使用独立安装的 1.0.1 与明确可执行路径；使用说明给出 exact-version 安装和 doctor 命令。升级系统安装由用户自行选择。

### D02 工具定义和派发双重约束

新建小型控制工具契约模块供 `task-tools.ts`、`team-messaging.ts` 和 gate 共用。run create、invoke、complete、yield、clarify、answer、decision、send/reply 配置 model-only + sequential；只读工具不改变 exposure。tool_call 在已有权限检查前检查嵌套控制调用。

`invocation.ts` 先根据片段种类计算完整工具集合，核对 `getAllTools()` 的 exposure，再 `setActiveTools()` 并比较 `getActiveTools()`，最后才请求注入与发送正式输入。不接受静默过滤；失败进入现有冻结/中断路径。保留 native file mutation queue 与既有文件路径护栏。选择直接调用约束而非全面禁用 Codemode，避免扩大本 change 的产品范围。

真实启动发现 `--tools` 同时限制 Extension 工具；只列文件工具会排除控制工具。默认启动使用官方 `createLsToolDefinition` 在 managed-search 注册 `ls`，每次调用的 operations 和返回都复核权限/片段栅栏；不通过修改宿主全局白名单补洞。

### D03 终止标记只结束本地推理

用成功返回 helper 给六类收尾加 `terminate: true`；被动 reply 与 invoke/send/run create 不加。错误沿既有异常路径，不由 finally 添加标记。Pi 批次仅所有最终工具结果都 terminate 才停止；不得把混合批次当立即 settled，也不得修改 Pi 的工具调度。

settled 事件捕获 current、binding、segment、generation、session 和 outcome。保留下一轮事件循环延迟，让 Pi 本身的 deferred work 先推进；回调使用执行栅栏和实时 localIdle/pending 再核对，在序列化发送前再核对一次。人工 compact/bash/session 边界走原 interruption/stopped，不发布旧片段的正常 settled。不修改 Go 确认流程。

### D04 当前上下文证据模块

新建 `extension/request-evidence.ts`，用 pi-ai `getCurrentSystemMessage` / `getCurrentTools` 从 `context_with_system` 计算 canonical 快照；按 Pi 自有 section 的 XML 包装计算预期哈希。以 section 名精确重放 system 更新/删除，解析最新 `pi_squad_task`，比较 task/attempt/segment 与 role/working/config hash，检查实际 active tools。仅保留哈希、身份及工具名称；请求序号把 canonical 与 provider 观察关联。

请求解码按可识别格式支持 OpenAI chat messages、Responses instructions/input、Anthropic system/messages（包括 tool_addition/removal）和 Gemini systemInstruction/functionDeclarations。只读 system/developer 块；用户/助手历史不纳入。不能可靠重放的结构返回 `unknown`。同一工具定义的替换按最后一次生效，工具集合须与 canonical 一致。section 哈希对应有效 XML 正文，不把格式化差异伪造成任务身份匹配。

生产 `before_provider_request` 记录 `observation_scope: squad_hook`，不宣称末位。阶段 04 的可复用 probe 明确最后加载，复用该模块生成 `last_observer` 证据。未知格式不影响普通诊断保存，但不能令 probe core_ready。不持久化 raw payload 或 canonical 全文。

### D05 schema 2 探针与 doctor

将可复用 probe 源码放入 `pi_squad_case/04-team-orchestration/compatibility/`，保留 ignored `integration/` 为本地运行证据目录。schema 2 保存 host identity、mode、profile、有序事件、canonical 与末位 provider 证据及 settled outcome。Go `ReadProbe` 校验整个正式周期：extension input → task sections → canonical → 对应序号的有效请求 → completed before-settle → idle/无 pending settled；身份、section 哈希、工具集合和观察位置均需一致。生命周期切换/中断使当前周期失效。

schema 1 可读取为 legacy diagnostic，`core_runtime_observed=false`；schema 2 宿主不匹配返回清晰错误。探针是可信本地文件的诊断材料，不提供签名或远程 attestation；`formal_execution_ready` 只说明宿主核心事件已观察，阶段 04 全场景结果仍独立。

### D06 验收边界

先完成源码、USAGE 和开发检查，再按仓库规则新建 Herdr 测试 workspace，启动当前项目 cwd 的三个角色 Pi、独立 Controller 与其 Dashboard。关闭上轮测试 space，不动用户服务。同 Project 已有用户 Controller 时不强占锁；明确报告外部阻塞。

使用实际 1.0.1，观察至少一个正式任务的末位 provider 证据和 settled 确认，核对三个角色身份、tool exposure、模式/版本拒绝和 doctor schema 2。补充检查混合批次、过期收尾、缺失工具及历史上下文误证；只按真实观察记录 PASS，不能用编译或源码扫描替代。复用阶段 04 总体集成入口，兼容场景 PC-A01—A19 单独列结果，不改变原 89 场景计数。

## Risks / Trade-offs

- [精确版本限制后续版本] → 新版先扩展 profile 和运行探针，用户能看到明确版本错误。
- [提供商有未识别增量格式] → 明确 unknown；完整声明与已识别更新可以证明，未知不标通过。
- [其他 Extension 位于 observer 后] → 文档要求 probe 最后加载，生产观察一直保持局部；probe 加载顺序本身由验收启动命令证明。
- [终止与混合批次语义容易被误解] → 保留 upstream batch 规则与 gate；记录真实 hook 顺序，Controller settled 唯一确认。
- [本地旧报告可被错误复用] → schema/profile/mode/path/hash 严格关联；旧报告仅诊断。
- [用户 Controller 占用项目锁] → 完成独立代码与规划后说明实际阻塞，绝不停止用户服务或绕过锁。

## Migration Plan

1. 实施兼容护栏、证据模块与 schema 2；不改 Controller 数据格式。
2. 单独安装 Pi 1.0.1，编译 Controller、针对该安装做 TypeScript 类型检查。
3. 在新的可见测试 space 使用明确 Pi 路径启动，probe 最后加载；记录实际验收结果和未覆盖边界。
4. 使用说明改为支持该 profile 的 TUI；旧探针需重新采集。回滚仅撤销本 change 源码/文档，不修改已有项目数据或全局 Pi。

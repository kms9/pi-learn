# squad-pi-host-compatibility Specification

## Purpose

定义 Pi Squad 对 Pi 1.0.1 宿主的正式执行兼容契约，使用户可以分辨可用模式、工具权限、真实任务收尾与有效请求证据，并防止安装诊断或历史上下文被误报为运行就绪。

## Requirements

### Requirement: 正式激活检查宿主 profile 与模式
Squad MUST 在注册及任务派发前检查实际 Pi 版本符合 `pi-coding-agent/1.0.1` profile、所需公共 API 可用且模式为 `tui`。初次激活不满足时 SHALL 明确说明原因并恢复普通 Pi 的工具及输入；已有未收尾片段 SHALL 保持隔离，不得因此释放资源。

#### Scenario: PC-A01 TUI 正式激活
- **WHEN** 实际 Pi 为 1.0.1、公共 API 可用且从 TUI 以合法身份启动
- **THEN** Squad 可以注册并按原协议领取任务

#### Scenario: PC-A02 非 TUI 明确拒绝
- **WHEN** 以 RPC、JSON 或 print 模式尝试初次激活 Squad
- **THEN** 不产生 Squad 注册或任务注入，诊断包含不支持的模式，普通 Pi 仍可使用

#### Scenario: PC-A03 版本不匹配
- **WHEN** 实际宿主为 1.0.0 或未验证的其他版本
- **THEN** Squad 拒绝正式激活并显示实际版本与所需 profile，不把 submodule 版本当实际宿主版本

### Requirement: 状态修改工具只允许直接模型调用
正式状态修改工具 MUST 使用 `model-only` 暴露和 `sequential` 执行，工具护栏 MUST 拒绝正式片段中的嵌套控制调用。查询工具仍受当前任务工具集合与既有文件边界约束。

#### Scenario: PC-A04 嵌套调用不改变控制状态
- **WHEN** 正式片段中的工具尝试嵌套调用 completion、yield、clarify、invoke、decision、Run create、send 或 reply
- **THEN** 调用被拒绝且不产生相应 Controller 状态修改

#### Scenario: PC-A05 控制批次串行执行
- **WHEN** 模型在同一批次请求多个 Squad 状态修改工具
- **THEN** Pi 串行执行该批次，每个调用仍核对当前片段与状态，不并发使用同一版本推进控制状态

### Requirement: 派发工具集合必须完整且可声明
Squad SHALL 在正式输入注入前核对整个所需工具集合已注册、具有可直接向模型声明的暴露方式且已实际启用。缺失或暴露不兼容 MUST 明确拒绝注入，不得静默删减权限清单后继续运行。

#### Scenario: PC-A06 缺失或隐藏工具
- **WHEN** 派发要求的任一工具缺失或具有 hidden、deferred、codemode 暴露方式
- **THEN** Squad 报告具体工具问题，不发送正式用户输入，也不声称该片段开始执行

#### Scenario: PC-A07 实际工具集合一致
- **WHEN** 完整工具集合注册且可直接声明
- **THEN** 注入时实际 active tools 与该集合一致，未授权工具的调用仍被现有护栏拒绝

### Requirement: 成功收尾终止模型继续推理并保留 settled 确认
成功的 completion、yield、clarify、clarification answer、Leader decision 及正式 ask reply SHALL 返回 `terminate: true`；失败或仅创建子任务、发送消息、被动回复 SHALL 不因此终止。Controller MUST 继续依据真实 settled 及现有确认流程推进任务，不得仅根据工具返回终止标记接受结果。

#### Scenario: PC-A08 单独成功收尾
- **WHEN** 模型单独调用成功的正式收尾工具
- **THEN** 不再为该收尾产生下一轮模型推理，随后真实 settled 驱动现有 Controller 确认

#### Scenario: PC-A09 失败收尾
- **WHEN** 收尾请求遭遇过期版本、权限或 Controller 错误
- **THEN** 返回错误而非成功终止，不把任务标记完成

#### Scenario: PC-A10 混合批次
- **WHEN** 收尾工具与非终止工具出现在同一批次
- **THEN** 遵守 Pi 仅在所有最终工具结果均终止时才终止批次的语义，不提前跳过其他调用或伪造 settled

### Requirement: 收尾回调不能跨越片段与本地中断边界
延后提交的 settled MUST 对应触发事件时的 binding、attempt、segment、generation 和 outcome，并在提交前核对本地 idle 且无 pending 输入。片段变化、原生会话切换、手动 compact/bash 或新输入导致旧回调失效时 SHALL 不发送旧片段的正常完成确认。

#### Scenario: PC-A11 回调期间切换或中断
- **WHEN** settled 事件之后、确认请求之前发生会话/片段变化或人工中断
- **THEN** 旧回调不推进正常完成，资源释放仍遵守原中断与 stopped 确认规则

#### Scenario: PC-A12 仍有待处理输入
- **WHEN** settled 回调执行时 Pi 已重新忙碌或存在 pending 输入
- **THEN** 不提交该次正常 settled 确认，保留正式片段隔离

### Requirement: 请求证据证明当前有效上下文
证据 SHALL 将 canonical 当前 system sections/tools 与提供商请求中的有效 system/tools 分开记录，包含完整 task、attempt、segment 身份及自有 section 哈希。证据 MUST 只处理 system/developer 上下文与工具声明/增量，不得因 user/assistant 历史文本含有任务标识而判定匹配。未知或不完整格式 MUST 标为 `unknown`，而非通过。

#### Scenario: PC-A13 历史身份不构成当前证据
- **WHEN** 历史用户消息含有预期任务标识但当前 system section 已删除或替换
- **THEN** 当前上下文匹配判定不通过

#### Scenario: PC-A14 system 与工具增量
- **WHEN** 请求以 system sections 更新或工具增加、移除表达当前上下文
- **THEN** 证据按时间顺序计算有效 section/tool 集合，并与 canonical 当前集合比较

#### Scenario: PC-A15 未知格式
- **WHEN** 请求格式无法可靠还原有效 system/tools
- **THEN** 证据显示 unknown 原因，doctor 不从该请求推导正式执行就绪

### Requirement: 证据标明观察位置并限制敏感信息
生产 Extension 的请求 hook SHALL 标为自身观察位置；仅明确加载在末位的验收 observer 可以标记末位观察。证据 SHALL 保存结构、标识与哈希，不保存原始 system、任务正文、请求体、认证信息或 headers。

#### Scenario: PC-A16 后续 Extension 修改请求
- **WHEN** 后续 Extension 修改请求
- **THEN** 生产 hook 的记录不宣称最终请求已证明，末位 observer 依据修改后的请求记录真实匹配结果

### Requirement: 能力诊断与真实运行证明分层
doctor SHALL 支持显式选择 Pi 可执行文件，报告实际版本、profile、安装类型及声明诊断；缺少内部声明文件 SHALL 不单独否决已支持的安装形态。正式就绪 MUST 同时满足宿主 profile 检查和 schema 2 实际运行探针的匹配身份、TUI 模式、有序生命周期、当前上下文及末位请求证明。schema 1 探针 SHALL 仅可诊断，不可宣称新 profile 就绪。

#### Scenario: PC-A17 安装没有声明文件
- **WHEN** 受支持版本的可执行安装没有内部 `.d.ts` 文件
- **THEN** doctor 给出诊断警告，并保持真实探针未运行状态而非误报 API 不可用或正式就绪

#### Scenario: PC-A18 旧报告或不匹配的宿主
- **WHEN** 传入 schema 1 报告，或报告的版本、profile、模式及宿主身份与所选安装不匹配
- **THEN** 不宣称正式就绪；不匹配报告明确拒绝，旧报告显示仅诊断

#### Scenario: PC-A19 真实 TUI 有序生命周期
- **WHEN** 所选 1.0.1 安装在 TUI 中记录正式输入、任务 sections、canonical 上下文、末位有效请求、completed before-settle 和 idle/无 pending settled
- **THEN** doctor 可以报告该宿主的 core runtime 已观察，阶段 04 全场景验收仍另行计算

## MODIFIED Requirements

### Requirement: 正式激活检查宿主 profile 与模式
Squad MUST 在注册及任务派发前检查实际 Pi 版本符合 `pi-coding-agent/1.1.0` profile、所需公共 API 可用且模式为 `tui`。初次激活不满足时 SHALL 明确说明原因并恢复普通 Pi 的工具及输入；已有未收尾片段 SHALL 保持隔离，不得因此释放资源。

#### Scenario: PC-A01 TUI 正式激活
- **WHEN** 实际 Pi 为 1.1.0、公共 API 可用且从 TUI 以合法身份启动
- **THEN** Squad 可以注册并按原协议领取任务

#### Scenario: PC-A02 非 TUI 明确拒绝
- **WHEN** 以 RPC、JSON 或 print 模式尝试初次激活 Squad
- **THEN** 不产生 Squad 注册或任务注入，诊断包含不支持的模式，普通 Pi 仍可使用

#### Scenario: PC-A03 版本不匹配
- **WHEN** 实际宿主为 1.0.1 或未验证的其他版本
- **THEN** Squad 拒绝正式激活并显示实际版本与所需 profile，不把 submodule 版本当实际宿主版本

### Requirement: 收尾回调不能跨越片段与本地中断边界
延后提交的 settled MUST 对应触发事件时的 binding、attempt、segment、generation 和 outcome，并在提交前核对本地 idle 且无 pending 输入。片段变化、原生会话切换、手动 compact/bash 或新输入导致旧回调失效时 SHALL 不发送旧片段的正常完成确认。

#### Scenario: PC-A11 回调期间切换或中断
- **WHEN** settled 事件之后、确认请求之前发生会话/片段变化或人工中断
- **THEN** 旧回调不推进正常完成，资源释放仍遵守原中断与 stopped 确认规则

#### Scenario: PC-A12 仍有待处理输入
- **WHEN** settled 回调执行时 Pi 已重新忙碌或存在 pending 输入
- **THEN** 不提交该次正常 settled 确认，保留正式片段隔离


#### Scenario: PC110-A01 取消优先于旧 completed
- **WHEN** Pi settled 标记 aborted=true，包括 result_proposed 后取消
- **THEN** 不提交正常 completed；仍依据真实 idle/no-pending 与当前 fence 处理 interrupted/stopped，不接受取消结果

### Requirement: 能力诊断与真实运行证明分层
doctor SHALL 支持显式选择 Pi 可执行文件，报告实际版本、profile、安装类型及声明诊断；缺少内部声明文件 SHALL 不单独否决已支持的安装形态。正式就绪 MUST 同时满足宿主 profile 检查和 schema 2 实际运行探针的匹配身份、TUI 模式、有序生命周期、当前上下文及末位请求证明。schema 1 探针 SHALL 仅可诊断，不可宣称新 profile 就绪。

#### Scenario: PC-A17 安装没有声明文件
- **WHEN** 受支持版本的可执行安装没有内部 `.d.ts` 文件
- **THEN** doctor 给出诊断警告，并保持真实探针未运行状态而非误报 API 不可用或正式就绪

#### Scenario: PC-A18 旧报告或不匹配的宿主
- **WHEN** 传入 schema 1 报告，或报告的版本、profile、模式及宿主身份与所选安装不匹配
- **THEN** 不宣称正式就绪；不匹配报告明确拒绝，旧报告显示仅诊断

#### Scenario: PC-A19 真实 TUI 有序生命周期
- **WHEN** 所选 1.1.0 安装在 TUI 中记录正式输入、任务 sections、canonical 上下文、末位有效请求、completed before-settle 和 idle/无 pending 且 aborted=false 的 settled
- **THEN** doctor 可以报告该宿主的 core runtime 已观察，阶段 04 全场景验收仍另行计算

#### Scenario: PC110-A02 managed 安装身份
- **WHEN** 显式选择官方 managed launcher 或其具体 release 的可执行入口
- **THEN** doctor 以该选定版本的实际 runtime 入口及 hash 验证 probe；布局无效、版本不同或入口 hash 不同明确拒绝，不以 launcher hash 冒充运行身份

#### Scenario: PC110-A03 取消信息缺失
- **WHEN** 1.1.0 probe 的 settled 缺少 aborted 或该标记为 true
- **THEN** 该生命周期不构成正常完成的 core runtime 证明

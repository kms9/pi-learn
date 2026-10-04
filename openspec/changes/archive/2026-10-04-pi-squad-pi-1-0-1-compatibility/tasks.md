## 1. P0 宿主与正式激活

- [x] 1.1 实现 TS 的 1.0.1 profile、公开 API 检查与宿主身份报告，声明文件改为可选诊断；通过针对实际 1.0.1 安装的类型检查核对公共接口。
- [x] 1.2 注册前拒绝非 TUI/版本不匹配并恢复普通 Pi，保持已有片段冻结规则；核对调用顺序，真实拒绝行为在 6.2 验收。
- [x] 1.3 对正式片段中意外 RPC 输入明确拦截，保留 TUI 的 Worker 中断、Leader guidance 和 handoff；核对输入分类，真实 TUI 行为在 6.2 验收。

## 2. P0 工具暴露与派发完整性

- [x] 2.1 控制工具统一 model-only + sequential，嵌套控制调用明确拒绝；核对所有状态修改工具定义和 parentToolCallId 护栏，运行验证在 6.3。
- [x] 2.2 注入前验证整个工具集合注册、exposure 与 active 一致，替换静默过滤；核对失败路径无正式输入，运行验证在 6.3。

## 3. P1 可靠收尾

- [x] 3.1 给成功 completion/yield/clarify/answer/decision/正式 ask reply 添加 terminate，失败与非收尾工具不添加；核对各成功返回分支及类型检查，真实批次行为在 6.3。
- [x] 3.2 settled 捕获片段、generation、binding/session 与 outcome，在回调和序列化发送前重新核对 idle/pending 与中断；核对原 stopped 路径保留，边界运行验证在 6.3。

## 4. P1 请求证据

- [x] 4.1 实现 canonical 当前 system sections/tools 的哈希与完整任务身份快照，在 context_with_system 记录关联序号；类型检查并核对无全文持久化。
- [x] 4.2 实现可识别请求格式的有效 system/tool 重放、unknown 与 canonical 比较，生产记录标明 squad_hook；核对历史 user/assistant 不参与，运行证据在 6.3。
- [x] 4.3 在阶段 04 compatibility 目录交付末位 schema 2 probe，复用生产证据模块；核对启动顺序、报告结构及隐私字段，真实保存报告在 6.2。

## 5. P1 能力检测与使用说明

- [x] 5.1 Go doctor 支持 --pi-binary、实际版本/profile、安装类型、路径/哈希与可选声明诊断；go build 通过，并用独立 1.0.1 安装输出实际诊断。
- [x] 5.2 ReadProbe 校验 schema 2 宿主身份及有序有效上下文生命周期，schema 1 仅诊断；go build 通过，实际报告和负例在 6.3。
- [x] 5.3 更新 USAGE 的精确版本、TUI-only、工具收尾、证据与 doctor 命令；逐项核对实现已落地，未实现能力不写入可用说明。

## 6. 开发检查与可见集成验收

- [x] 6.1 独立安装并明确选择 Pi 1.0.1，完成 TS 类型检查和 Controller 编译；记录真实命令、版本与结果，不新增或运行单元测试。
- [x] 6.2 关闭旧测试 space 后新开 Herdr workspace，在项目 cwd 启动三个不同角色的 1.0.1 Pi、独立 Controller 和 Dashboard；直接读取 pane 核对身份、TUI 激活、模式/版本拒绝、正式任务与 schema 2 保存。
- [x] 6.3 用真实运行及受控集成输入检查工具完整性/嵌套限制、成功与失败收尾、混合批次、旧 settled 边界、历史上下文误证、unknown 和 doctor 旧/不匹配报告；在阶段 04 兼容结果逐项记实际观察及未覆盖，不把编译当 PASS。
- [x] 6.4 将结果、TUI 决策与未决问题写回 wiki，更新 index/log 并严格验证本 change；任务仅在相应范围完成时勾选，保留原阶段 04 未完成项。

## 完成说明

本 change 的 17 个实施/检查任务已完成。6.3 的检查按实际观察记录覆盖范围：兼容场景 14 PASS / 5 PARTIAL，详见 `pi_squad_case/04-team-orchestration/compatibility/README.md`；不是 19 场景全部通过，也不勾选旧阶段 04 的未完成任务。剩余分支写回 wiki Q24。

检查：实际 1.0.1 公共声明的 TS 类型检查、Controller go build、git diff --check 与 OpenSpec --strict 通过；不新增或运行单元测试。真实 schema 2 的核心事件就绪，测试 space/临时控制文件已清理，Attempt cleanup 均 released。

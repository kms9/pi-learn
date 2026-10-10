## 1. 兼容实现

- [x] 1.1 同步 TS/Go 精确 1.1.0 profile；类型检查与 doctor 显示实际 1.1.0。
- [x] 1.2 settled.aborted 优先于缓存 outcome，保留 fence/原生中断；真实取消不提交正常完成。
- [x] 1.3 doctor 支持官方 managed launcher 的实际入口并拒绝无效布局/版本差异；launcher 与 release 诊断身份一致。
- [x] 1.4 observer/probe 校验明确 aborted=false 的成功生命周期；缺失/true/旧 profile 报告不就绪。
- [x] 1.5 同步 README/USAGE 与可复用 1.1.0 兼容入口；链接和 CLI 参数核对通过。
- [x] 1.6 严格公共声明类型检查、普通及 integration Go 构建、严格 OpenSpec 校验通过。

## 2. 新版本真实集成

- [x] 2.1 新 Herdr 测试 workspace，在项目 cwd 至少三 Role 加 Controller/Dashboard；确认实际 1.1.0 注册。
- [x] 2.2 正常完成、父子 yield/clarify/answer、人工插话及原生会话操作实跑，保留新版本证据。
- [x] 2.3 result_proposed 后 Esc 与取消重试实跑；取消不得 completed，资源安全释放。
- [x] 2.4 新 probe 在 managed launcher/release doctor 均就绪；取消/缺字段/错误安装的报告明确拒绝。
- [x] 2.5 实跑权限/loadout/末位请求证据及 TUI，未授权 nested/MCP 不改变控制状态。

## 3. 阶段验收与收口

- [x] 3.1 新版本矩阵初始化原 89 主 ID 为 NOT_RUN，保留旧版结果与新失败历史。
- [ ] 3.2 在 1.1.0 重新完成原 89 项判据和升级新增覆盖，逐项记录真实结果。
- [ ] 3.3 收尾所有测试任务与资源，退出本次 Pi/Controller/Dashboard 并关闭本次测试 space。
- [ ] 3.4 同步主宿主规格、版本化验收入口和 wiki；最终结果、覆盖限制与未决一致。

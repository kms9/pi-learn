## Why

本机 Pi 已升级到 1.1.0，Squad 仍精确拒绝该版本。新增取消标记与 managed launcher 布局需要适配，才能保持任务收尾和真实运行诊断可信。

## What Changes

- **BREAKING**：正式激活目标从 Pi 1.0.1/TUI 切换为精确 Pi 1.1.0/TUI；旧版及未验证版本继续拒绝。
- 真实 settled 的 aborted 标记优先于缓存 outcome，避免取消按正常完成提交；保留 fence 与原生操作保护。
- Controller doctor 解析官方 managed 安装的实际 release 入口，和 Extension 运行身份一致；不执行任意 launcher 内容，不削弱 hash 校验。
- observer 与 probe reader 要求明确未取消的成功生命周期，旧 probe 不冒充新版本证明。
- 更新说明与独立 1.1.0 结果；真实三角色、升级负例及阶段 04 原 89 项重新验收。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `squad-pi-host-compatibility`：1.1.0 profile、取消收尾、managed 安装身份与新 probe 成功判据。

## Impact

`pi_squad/extension/{doctor,invocation}.ts`、Controller `project/{doctor,probe}.go`、兼容 observer、README/USAGE、宿主规格、阶段 04 版本化验收与 wiki。沿用现有 Task/Attempt/HTTP/SSE/数据库协议。上游 submodule 与已有用户服务不修改；120 秒业务截止等其他业务优化不属于本升级。

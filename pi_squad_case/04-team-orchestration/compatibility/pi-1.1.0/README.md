---
title: Pi 1.1.0 升级验收入口
type: process
status: active
created: 2026-10-09
updated: 2026-10-09
---

# Pi 1.1.0 升级验收入口

正式目标为精确 Pi 1.1.0/TUI。当前完成兼容代码，真实验收进行中；不能沿用 [1.0.1 的 PASS](../README.md)。配置和产品用法见 [USAGE](../../../../pi_squad/USAGE.md)，变更见 [OpenSpec](../../../../openspec/changes/pi-squad-pi-1-1-0-compatibility/)。

仍使用上级目录的 `adapter-entry.ts`、末位 `pi-probe.ts` 和原阶段 04 故障入口；探针新增 `agent_settled.aborted`。doctor 的 schema 2 成功生命周期要求明确 aborted=false，缺失、true、旧版本/profile、错误实际入口/hash 都不能证明就绪。

managed 默认启动器和具体 release 入口均可传入 doctor，核对的是同一个实际 runtime 文件。布局不识别时可选择具体 release；不得删除身份校验来绕过失败。

新版本矩阵与原始证据保存在本地 ignored `../../integration/pi-1.1.0/`；原 89 主 ID 全部重新初始化为 NOT_RUN。每项保留判据、新运行 ID、Pi/Controller 版本、失败与复测，不复制旧证据或结果。

真实检查按插件 AGENTS：新测试 workspace、项目 cwd、至少三 Role、独立 Controller/Dashboard。额外检查 result_proposed 后 Esc、retry 取消、probe 缺 aborted、managed 身份与版本切换。完成后在此更新实际结论，阶段 04 原矩阵不改写为新版本结论。

## MCP 与 nested 权限入口

`mcp-entry.ts` 可替换生产入口，随后末位加载上级 `pi-probe.ts`。它使用所选 Pi 1.1.0 的内置 MCP client 和 `mcp-server.py` 本地 stdio fixture，不加载或修改个人 MCP 配置。真实 managed read 中尝试一个已注册但未授权的 MCP 工具和九种 model-only 控制工具，所有 nested 调用必须拒绝；本地 server 只能收到 initialize/notifications/tools-list，不能收到 tools/call。该入口保留原生 read、artifact、真实模型及生产 gate，不伪造任务结果。

依据 [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) 和 [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。这是受控本地 MCP 传输覆盖，不推导其它远程服务器或 OAuth 分支通过。

## Context

见 proposal 与 2026-10-09 wiki 评估。当前 runtime 支持精确 1.0.1；1.1.0 settled 新增 aborted；本机默认安装是官方 shell launcher，实际运行 npm release。

## Goals / Non-Goals

统一 Extension、doctor 与真实 probe 的 1.1.0/TUI 身份和取消判断；不扩大工具权限、不更改任务/数据库协议、不变更 120 秒业务截止或其他已知业务需求。

## Decisions

1. 精确目标常量改为 1.1.0，旧 profile 不兼容。probe schema 2 保持原封装，在 settled details 增加必需 aborted=false 的成功判据。
2. settled 读取 aborted，true 转为 aborted outcome。仍捕获旧 fence、idle/no-pending 与延迟原生 compact 保护，复用 Controller 的非 completed 中断路径。
3. doctor 区分用户选定 launcher 与实际入口。只识别已知官方 managed 布局与 launcher 契约，读取 install/current-version 并验证安全版本名、release package 版本及实际入口；不解析执行任意脚本命令。launcher 输出版本、入口输出版本及 metadata 必须相同，最终入口路径/hash 仍须与 probe 精确匹配。未知脚本继续按普通 executable 诊断，不猜安装。
4. 1.1.0 结果写新版本目录，不覆盖 1.0.1 cases。真实模型、可见角色 pane 与 Controller/Dashboard 共同验证；负例和 HTTP 子断言不得冒充完整业务 PASS。

## Risks / Trade-offs

- launcher 布局会变化 → 已知契约解析，无效明确诊断，可指定 release 入口。
- 取消与 compact 竞态 → 保留既有 generation/session fence；实跑工具结果后的 Esc 与 retry 取消。
- 模型、现有业务截止及旧夹具影响 89 项 → 保留失败链，按真实结果修复本升级范围内问题；原有业务问题不静默修改或降低验收。
- 用户已有服务 → 新测试 space，隔离数据库；Project 已被用户 Controller 持锁时不抢占。

## Migration Plan

先完成开发与编译；建立新 workspace 的三角色与 Controller/Dashboard，验证核心与负例；执行原 89 项；收尾资源后更新版本化结果与主 spec。旧安装须显式保留才能回退，不假设 managed updater 自动保留 1.0.1。

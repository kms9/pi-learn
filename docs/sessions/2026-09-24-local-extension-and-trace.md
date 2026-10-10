---
title: 2026-09-24 本地 Squad 安装与注入追踪
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
---

# 2026-09-24 本地 Squad 安装与注入追踪

## 用户要做什么

让本地 Squad 被直接启动的 Pi 自动加载，并查看角色注入后的模型上下文与调用链。

## 达成了什么

- `pi install /absolute/path/pi_squad/extension/index.ts` 可持久登记本地文件，无需 npm 发布；默认用户级，`-l` 为项目级。保存路径、不复制文件。
- 当前目录缺少 package 清单，且 `extension/` 不是约定的 `extensions/`，推荐精确登记入口。包分发可另加 `pi.extensions` 清单。
- 当前 `--no-extensions` 关闭安装扩展的自动发现。隔离实验显式 `-e` 加载 Squad 与 Trace；日常安装后直接 `pi`。
- 本机只读检查：Pi 0.87.1；Trace 与 pi-context 均已安装。未执行安装、启动模型或改全局配置。
- Trace 的 `before_provider_request` 可观察角色注入后的请求，`/trace` 看单会话、`/trace all` 看 dashboard；首次输入前角色尚未注入，旧请求不会补录。
- Trace 有 8000 字符截断，角色文本在长提示末尾可能不可见；不涵盖 Controller 内部链路或自动关联独立 Squad 进程。pi-context 侧重上下文管理。

## 写回了哪些 wiki 页

- 使用步骤维护在 `pi_squad/USAGE.md`，本页记录结论。
- 更新 `docs/index.md`、`docs/log.md`。

## 未决

- 若需要未截断的请求快照或跨 Squad 链路，需另行设计采集与关联；本轮未实现。

## 相关页面

- [[concepts/pi-package|Pi package]]
- [[concepts/pi-squad|Pi Squad]]
- [[sources/pi-trace-extension|Pi Trace Extension]]

## 证据

- [使用说明](../../pi_squad/USAGE.md)
- [Pi 本地包规则](../../docs-zh/pi-dev/packages/coding-agent/docs/packages.md)
- [Squad 实现](../../pi_squad/extension/index.ts)
- [Trace 实现](../../pi-trace-extension/extensions/trace/index.ts)
- [Trace 上游说明](https://github.com/npxcnency-ux/pi-trace-extension)

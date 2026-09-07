---
title: Extension
type: concept
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - concept
---

# Extension

本仓库说「Pi 插件」时，**默认指 Extension**。

## 是什么

TypeScript 模块，default export 为 `(pi: ExtensionAPI) => void | Promise<void>`。用 `pi.on`、`pi.registerTool`、`pi.registerCommand` 等往一张登记表上挂能力。

放置：

- `~/.pi/agent/extensions/` 全局
- `.pi/extensions/` 项目（需 project trust）
- `pi -e ./path.ts` 临时

## 不是什么

- 不是 [[pi-package|Pi package]]（那是分发单位，里面可以带扩展）
- 不是 [[chord-plugin|Chord facet]]（实验性、按进程拆 bundle）

## 证据

- `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md`
- `docs-zh/pi-dev/packages/coding-agent/docs/extensions-impl.md`
- `docs-zh/pi-dev/packages/coding-agent/src/core/extensions/`

## 相关

- [[learning/怎么学写插件|怎么学写插件]]

---
title: Pi package
type: concept
status: active
created: 2026-09-07
updated: 2026-09-07
tags:
  - project-wiki
  - concept
---

# Pi package

用 `package.json` 的 `pi` 字段把扩展、skills、prompts、themes 打成可 `pi install` 的包。

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
```

证据：`docs-zh/pi-dev/packages/coding-agent/docs/packages.md`

和 [[extension|Extension]] 的关系：包是分发与安装；扩展是运行时模块。一个包可以声明多个扩展入口。

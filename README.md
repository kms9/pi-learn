# pi_case

Pi 相关上游仓库的**本地阅读与中文维护层**。上游源码仍各自独立 clone，本仓库只跟踪译文、解读和同步脚本。

## 目录

| 路径 | 作用 |
|------|------|
| `docs-zh/` | 中文阅读层，镜像 `pi-dev/` 的相对路径 |
| `docs-zh/manifest.json` | 每篇译文对应的上游路径和 `sourceSha256` |
| `scripts/sync-zh.py` | 对照本地 `pi-dev`，标出过期/缺失/上游新文档 |
| `pi-dev/` | [earendil-works/pi](https://github.com/earendil-works/pi) 的本地 clone（**不提交到本仓库**） |
| 其他 `pi-*` / `agent-tools` 等 | 同样是本地 clone，未纳入本仓库 |

读扩展实现：从 `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md` 和 `extensions-impl.md` 开始。

## 日常更新

```bash
# 1. 更新上游（在干净的 pi-dev 上）
git -C pi-dev pull

# 2. 看哪些译文过期
python3 scripts/sync-zh.py

# 3. 改 docs-zh 里对应文件后，接受新的原文哈希
python3 scripts/sync-zh.py \
  --accept pi-dev/packages/coding-agent/docs/extensions.md \
  --record-head
```

`sync-zh.py` 默认退出码 `1` 表示有 stale、缺文件、或 HEAD 相对 manifest 已漂移。`--json` 可给后续自动化用。

## 在 GitHub 上维护

可以。这个仓库适合作为**独立 overlay 仓库**持续维护，而不是 fork 整份 `earendil-works/pi`。

推荐方式：

1. 在 GitHub 建一个空仓库（例如 `yourname/pi-case`），不要从 pi 官方仓 fork。
2. 本仓库只提交 `docs-zh/`、`scripts/`、`README.md`、`.gitignore`。
3. 协作者 clone 本仓库后，再把官方 pi clone 到旁边的 `pi-dev/`：

```bash
git clone git@github.com:yourname/pi-case.git
cd pi-case
git clone git@github.com:earendil-works/pi.git pi-dev
git -C pi-dev checkout $(python3 -c "import json; print(json.load(open('docs-zh/manifest.json'))['upstream']['head'])")
```

4. 之后：`git -C pi-dev pull` → `python3 scripts/sync-zh.py` → 更新过期译文 → 把 `docs-zh` 的改动 commit / push 到**本仓库**。

不要把 `pi-dev` 推进这个 GitHub 仓库：体积大、和上游重复、也无法干净 `git pull`。需要钉死上游版本时，用 `manifest.json` 里的 `upstream.head`，或以后再改成 submodule。

## 约定

- 不修改 `pi-dev` 里的上游文件。中文只写在 `docs-zh/`。
- `docs-zh` 内路径与上游同名、同层级（`packages/coding-agent/docs/extensions.md`）。
- `kind: annotated-source` 是带中文注释的源码**副本**；上游文件保持英文。
- `kind: original` 是本仓库自己写的说明，上游没有对应文件。

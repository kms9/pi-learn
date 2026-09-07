# pi_case

Pi 相关上游仓库的**本地阅读与中文维护层**。上游源码仍各自独立 clone，本仓库只跟踪译文、解读和同步脚本。

## 目录

| 路径 | 作用 |
|------|------|
| `docs/` | LLM Wiki：概念、决策、会话写回、学习路径 |
| `docs-zh/` | 中文阅读层，镜像 `pi-dev/` 的相对路径 |
| `docs-zh/manifest.json` | 每篇译文对应的上游路径和 `sourceSha256` |
| `scripts/sync-zh.py` | 对照本地 `pi-dev`，标出过期/缺失/上游新文档 |
| `pi-dev/` 等 | 已有 GitHub 仓，以 **git submodule** 钉死 commit（见 `.gitmodules`） |

学习与沟通记录走 LLM Wiki：入口 [`docs/index.md`](docs/index.md)。规则在 `AGENTS.md`。上游中文镜像仍在 `docs-zh/`。

读扩展实现：从 `docs-zh/pi-dev/packages/coding-agent/docs/extensions.md` 和 `extensions-impl.md` 开始。

## 日常更新

```bash
# 1. 把各 GitHub submodule 拉到 .gitmodules 里记录的分支尖
./scripts/sync-submodules.sh

# 2. overlay 里会看到 gitlink SHA 变化；确认后 commit 这些路径以钉死新版本

# 3. 对照 pi-dev 译文是否过期
python3 scripts/sync-zh.py

# 4. 改 docs-zh 里对应文件后，接受新的原文哈希
python3 scripts/sync-zh.py \
  --accept pi-dev/packages/coding-agent/docs/extensions.md \
  --record-head
```

`sync-zh.py` 默认退出码 `1` 表示有 stale、缺文件、或 HEAD 相对 manifest 已漂移。`--json` 可给后续自动化用。

## 在 GitHub 上维护

可以。这个仓库适合作为**独立 overlay 仓库**持续维护，而不是 fork 整份 `earendil-works/pi`。

推荐方式：

1. 在 GitHub 建一个空仓库（例如 `yourname/pi-case`），不要从 pi 官方仓 fork。
2. Overlay 提交 wiki、`docs-zh/`、脚本、`.gitmodules` 和各 submodule 的 gitlink SHA，不把上游源码打进本仓历史。
3. 协作者：

```bash
git clone --recurse-submodules git@github.com:yourname/pi-case.git
# 若已经 clone 过但没带子模块：
git submodule update --init --recursive
```

4. 之后：`./scripts/sync-submodules.sh` → 如需钉版本则 commit gitlink → `python3 scripts/sync-zh.py` → 更新过期译文 → push **本 overlay 仓库**。

Submodule 只记录对方仓库的 commit SHA，不会把整份源码打进 overlay 历史。

## 约定

- 不修改 `pi-dev` 里的上游文件。中文只写在 `docs-zh/`。
- `docs-zh` 内路径与上游同名、同层级（`packages/coding-agent/docs/extensions.md`）。
- `kind: annotated-source` 是带中文注释的源码**副本**；上游文件保持英文。
- `kind: original` 是本仓库自己写的说明，上游没有对应文件。

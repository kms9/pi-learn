# dsh_squad：DS Bot + Squad

把 Squad 的正式任务治理（Controller、DAG、Review、恢复）接到 DS Bot 上。规划与决策见 [`docs/dsh-squad-dev-plan-2026-10-18.md`](../docs/dsh-squad-dev-plan-2026-10-18.md)（D1–D12 于 2026-10-19 拍板）；配置与启动见 [USAGE.md](USAGE.md)。

**上游代码不直接修改。** `dsh-bot/` 子模块钉在 `e13bc34`，DSH 用 npm `0.2.1-rc.2`（D9）。对 ds-bot 的全部改动在一个补丁里，只做 seam（归属 + 拦截，D2）；DSH 一行没改。

| 路径 | 内容 |
|---|---|
| `controller/` | Go Controller（从 `pi_squad/controller` 迁来，D1），协议 `squad/3` |
| `protocol/` | `squad/3` 契约说明与导出的 JSON Schema |
| `adapter/` | DSH 插件 `dsh-squad-adapter`：受控会话的准入、结束判定、模型冻结、工具限制、任务工具与任务上下文，并向 Controller 上报 |
| `patches/ds-bot/0001-squad-seam.patch` | ds-bot seam 补丁（v2）：创建时归属、固定的 pre-step 拦截点、resume 开关、`defineTool` |
| `scripts/prepare-ds-bot.sh` | 导出钉住的 ds-bot 并打补丁 → `.build/ds-bot`（gitignored）；`--test` 跑 ds-bot 单测 |
| `deploy/dsh-squad`、`deploy/provision.mjs`、`deploy/template/` | 按项目目录一键启动 DS Bot + Controller（`up/down/status/provision`），预置团队，默认小队配置 |
| `client/` | Squad 页面（DS Bot 客户端插件，React）：运行、小队与规则、实验报告；构建到 `adapter/client.js` |
| `experiments/run.mjs` | 对照实验 S/A/B/C，报告 `dsh-squad-experiment/1` |
| `scripts/check.sh` | 每个工作包的最低验证：Controller 编译/vet/单测、Adapter 单测、补丁后的 ds-bot 单测 |

## seam 补丁改了哪些上游文件

| 文件 | 改动 | 原因 |
|---|---|---|
| `src/host/seam.js`（新增） | `dsBotSeam` 服务：`ownerOf`、`attachGate`、`createMessage`、`resolveAgent`、`chatOf`、`groupSessionOf`、`botOf`、`bots`、`defineTool`、`ready` | 外部插件拿不到 Bot↔Session 映射（P0 H2）；任务工具要用 DS Bot 自己解析到的 DSH tools |
| `index.js` | 在 `store` 之后加载 `seam` | — |
| `src/host/roster.js`、`groups.js` | 创建会话时先登记 owner 再交给 DSH | `agent/created` 时就能查到归属 |
| `src/host/parts.js` | 新 part 带 owner；最外层 pre-step 先交给 `seam.preStep` | pre-step 顺序不受插件加载顺序影响（P0 H7） |
| `src/host/resume.js` | resend/resume 前先问 `seam.allows` | 受控会话不自动重放（P0 H5） |
| `test/squad-seam.test.js`（新增） | seam 单测 | — |

没挂 Adapter 时行为与上游一致。

## 测试

```bash
dsh_squad/scripts/check.sh                                  # 编译 + 单测
export SQUAD=1 MOCK_DELAY_MS=600 CONTEXT_WINDOW=100000 CHECK_RATIO=0.45
probes/bench.sh p1 3201 8901 reset && node probes/drive-p1.mjs p1 3201 8901; probes/bench.sh p1 3201 8901 stop
node probes/drive-m1.mjs m1 3301 8911                       # 真 Controller + Adapter 端到端（mock）
node probes/drive-m0.mjs 3420                               # 一键启动、预置团队、Free 模式、重启（mock）
node probes/drive-m2.mjs 3430                               # 数学课件 Run：审核、退回返工、Leader 完成（mock）
node probes/drive-m3.mjs 3450                               # 页面的宿主路由：配置、开始、版本校验、Controller 重启（mock）
PUPPETEER_CORE=<dir> node probes/ui-check.mjs <project> <prefix>   # 页面在无头 Chrome 里（需先 up 一个数学案例项目）
```

环境变量要 `export`：驱动在用例里会重启宿主，没导出的变量会丢。只用 mock 模型，不需要 key（D7）。

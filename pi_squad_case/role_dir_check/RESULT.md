# 角色目录与发现链路可见验收

日期：2026-09-24
当前一轮：Herdr `squad-check` / `wD`，端口 `127.0.0.1:18781`
上一轮 `wC` 使用了 `/tmp` cwd，不作为本仓库 `.agents/roles` 的证据。开始本轮前，会话里已没有上次的测试 workspace，所以没有关闭任何用户 space。

## 现场

| 项 | 值 |
|---|---|
| workspace | `squad-check` / `wD` |
| Controller | `wD:p1`，`127.0.0.1:18781`，库 `/tmp/pi_squad_check_18781.sqlite` |
| Dashboard | `wD:p2`，`tui --url http://127.0.0.1:18781` |
| reviewer | `wD:p3`，cwd `/Users/logo/self_repo/pi_case` |
| backend | `wD:p4`，同一项目目录 |
| scribe | `wD:p5`，同一项目目录。仓库原先只有两个角色，本轮补了 `.agents/roles/scribe/role.md` 才凑满三个 |
| 预期负例 | `wD:p6`，标签 `NEG flat-role`，cwd `/tmp/pi-squad-flat-neg` |

## 结果

| 项 | 状态 | 看到的 |
|---|---|---|
| 三个角色从项目目录加载 | PASS | whoami 的 `cwd` 是 `/Users/logo/self_repo/pi_case`。reviewer 的 `config_path` 是 `.../.agents/roles/reviewer/role.md`，`role_dir` 是 `.../.agents/roles/reviewer`。backend、scribe 同样指向各自目录 |
| 注册与 Dashboard | PASS | Controller 注册了 reviewer-check、backend-check、scribe-check。Dashboard 三行 online，没有 flat-negative |
| 按角色发现再精确查询 | PASS | reviewer 的 list_agents(role=scribe) 只返回 scribe-check / `wD:p5`，get_agent 的 cwd 与 runtime_id 和 scribe whoami 一致 |
| 旧平铺文件 | PASS（预期拒绝） | `wD:p6` 报 `flat role files are no longer supported; move to reviewer/role.md; register skipped`。不是正常角色加载失败 |
| 消息发送 | NOT_RUN | 没有消息工具。发现通过不等于通信通过 |

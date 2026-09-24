# Pi Squad Extension

`export default function (pi: ExtensionAPI)`。配置、启动和会话内用法见 [`../USAGE.md`](../USAGE.md)。

由 Pi 的 jiti 加载，依赖 `@earendil-works/pi-coding-agent` / `typebox` / `@earendil-works/pi-ai`（随 Pi 运行时解析）。Markdown frontmatter 使用显式依赖 `yaml`，在仓库根目录执行 `npm ci --prefix pi_squad`。

给本目录加命令、工具或配置字段时，同一次改动更新 `../USAGE.md`。未实现的能力不要写进那份说明。

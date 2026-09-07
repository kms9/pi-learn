本文是 `packages.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以帮助你创建 pi 包。让它把你的扩展、技能、提示词模板或主题打包即可。

# Pi 包 {#pi-packages}

Pi 包将扩展、技能、提示词模板和主题打包，以便通过 npm 或 git 分享。包可以在 `package.json` 的 `pi` 键下声明资源，也可以使用约定目录。

## 目录 {#table-of-contents}

- [安装与管理](#install-and-manage)
- [包来源](#package-sources)
- [创建 Pi 包](#creating-a-pi-package)
- [包结构](#package-structure)
- [依赖](#dependencies)
- [包过滤](#package-filtering)
- [启用与禁用资源](#enable-and-disable-resources)
- [作用域与去重](#scope-and-deduplication)

## 安装与管理 {#install-and-manage}

> **安全：** Pi 包以完整系统权限运行。扩展会执行任意代码，技能可以指示模型执行任何操作，包括运行可执行文件。安装第三方包前请审查源代码。

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo  # 原始 URL 也可以
pi install /absolute/path/to/package
pi install ./relative/path/to/package

pi remove npm:@foo/bar
pi list                     # 显示 settings 中已安装的包
pi update                   # 仅更新 pi
pi update --all             # 更新 pi、更新包，并核对 pinned git ref
pi update --extensions      # 仅更新包并核对 pinned git ref
pi update --models          # 仅刷新模型目录
pi update --self            # 仅更新 pi
pi update --self --force    # 即使当前版本已是最新也重新安装 pi
pi update npm:@foo/bar      # 更新一个包
pi update --extension npm:@foo/bar
```

这些命令管理 pi 包，且 `pi update` 可以更新 pi CLI 安装。对于实验性的由安装器管理的安装，`pi update` 会把精确检查过的版本安装到一个暂存的、由 lockfile 支持的发行中，并仅在验证后激活，若更新失败则保持当前发行不变。受管理的安装不支持 `--force`；重新运行安装器来修复。要卸载 pi 本身，参见 [Quickstart](quickstart.md#uninstall)。

默认情况下，`install` 和 `remove` 写入用户设置（`~/.pi/agent/settings.json`）。使用 `-l` 改为写入项目设置（`.pi/settings.json`）。项目设置可以与团队共享，pi 会在项目被信任后于启动时自动安装任何缺失的包。

若要在不安装的情况下试用一个包，使用 `--extension` 或 `-e`。这会安装到仅用于当前运行的临时目录：

```bash
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

## 包来源 {#package-sources}

Pi 在设置和 `pi install` 中接受三种来源类型。

### npm {#npm}

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- 带版本的 spec 会被 pinned，包更新会跳过它们（`pi update --extensions`、`pi update --all`）。
- 用户安装位于 `~/.pi/agent/npm/`。
- 项目安装位于 `.pi/npm/`。
- 在 `settings.json` 中设置 `npmCommand`，可将 npm 包查找与安装操作固定到特定包装命令，例如 `mise` 或 `asdf`。

示例：

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git {#git}

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- 没有 `git:` 前缀时，只接受协议 URL（`https://`、`http://`、`ssh://`、`git://`）。
- 有 `git:` 前缀时，接受简写格式，包括 `github.com/user/repo` 和 `git@github.com:user/repo`。
- 同时支持 HTTPS 和 SSH URL。
- SSH URL 会自动使用你已配置的 SSH 密钥（遵循 `~/.ssh/config`）。
- 对于非交互运行（例如 CI），可以设置 `GIT_TERMINAL_PROMPT=0` 以禁用凭据提示，并设置 `GIT_SSH_COMMAND`（例如 `ssh -o BatchMode=yes -o ConnectTimeout=5`）以便快速失败。
- Ref 是 pinned 的 tag 或 commit。`pi update --extensions` 和 `pi update --all` 不会把它们移到更新的 ref，但会把现有 clone 核对到已配置的 ref。
- 使用 `pi install git:host/user/repo@new-ref` 可更新设置，并把现有包移到新的 pinned ref。
- 克隆到 `~/.pi/agent/git/<host>/<path>`（全局）或 `.pi/git/<host>/<path>`（项目）。
- 当核对改变 checkout 时，pi 会 reset 并 clean clone，然后若存在 `package.json` 则运行 `npm install`。

**SSH 示例：**
```bash
# git@host:path 简写（需要 git: 前缀）
pi install git:git@github.com:user/repo

# ssh:// 协议格式
pi install ssh://git@github.com/user/repo

# 带版本 ref
pi install git:git@github.com:user/repo@v1.0.0
```

### 本地路径 {#local-paths}

```
/absolute/path/to/package
./relative/path/to/package
```

本地路径指向磁盘上的文件或目录，并加入设置而不复制。相对路径相对于它们所在的设置文件解析。如果路径是文件，则作为单个扩展加载。如果是目录，pi 按包规则加载资源。

## 创建 Pi 包 {#creating-a-pi-package}

在 `package.json` 中添加 `pi` 清单，或使用约定目录。加入 `pi-package` 关键字以便被发现。

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

路径相对于包根目录。数组支持 glob 模式和 `!exclusions`。正向的清单 glob 按词法顺序发现可见路径。点前缀路径请直接列出。如果 glob 需要穿过符号链接才能继续，请直接列出被链接的资源根。

### Gallery 元数据 {#gallery-metadata}

[package gallery](https://pi.dev/packages) 会显示带有 `pi-package` 标签的包。添加 `video` 或 `image` 字段以展示预览：

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**：仅 MP4。在桌面上，悬停时自动播放。点击会打开全屏播放器。
- **image**：PNG、JPEG、GIF 或 WebP。显示为静态预览。

若两者都设置，video 优先。

## 包结构 {#package-structure}

### 约定目录 {#convention-directories}

若没有 `pi` 清单，pi 会从这些目录自动发现资源：

- `extensions/` 加载 `.ts` 和 `.js` 文件
- `skills/` 递归查找 `SKILL.md` 文件夹，并将顶层 `.md` 文件作为技能加载
- `prompts/` 加载 `.md` 文件
- `themes/` 加载 `.json` 文件

## 依赖 {#dependencies}

第三方运行时依赖应放在 `package.json` 的 `dependencies` 中。不注册扩展、技能、提示词模板或主题的依赖也应放在 `dependencies` 中。当 pi 从 npm 或 git 安装包时，会运行 `npm install`，因此这些依赖会自动安装。

Pi 为扩展和技能捆绑了核心包。如果你导入其中任何一个，请把它们列在 `peerDependencies` 中并使用 `"*"` 范围，且不要捆绑它们：`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`。

其他 pi 包必须捆绑进你的 tarball。把它们加入 `dependencies` 和 `bundledDependencies`，然后通过 `node_modules/` 路径引用它们的资源。Pi 以独立的模块根加载包，因此分开安装不会冲突或共享模块。

示例：

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## 包过滤 {#package-filtering}

使用设置中的对象形式过滤包加载的内容：

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` 和 `-path` 是相对于包根目录的精确路径。

- 省略某个键以加载该类型的全部内容。
- 使用 `[]` 以不加载该类型的任何内容。
- `!pattern` 排除匹配项。
- `+path` 强制包含精确路径。
- `-path` 强制排除精确路径。
- 过滤器叠加在清单之上。它们会收窄已经允许的内容。

## 启用与禁用资源 {#enable-and-disable-resources}

使用 `pi config` 启用或禁用来自已安装包和本地目录的扩展、技能、提示词模板和主题。`pi config` 从全局设置（`~/.pi/agent/settings.json`）开始；按 Tab 可在全局与项目本地模式之间切换。使用 `pi config -l` 从项目覆盖（`.pi/settings.json`）开始，继承的全局资源会变暗显示。

## 作用域与去重 {#scope-and-deduplication}

包可以同时出现在全局和项目设置中。如果同一包同时出现在两者中，项目条目生效，除非项目条目设置了 `autoload: false`，此时它会作为对全局条目的增量应用。身份由以下内容确定：

- npm：包名
- git：不含 ref 的仓库 URL
- local：解析后的绝对路径

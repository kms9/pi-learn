本文是 `containerization.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 容器化 {#containerization}

Pi 默认以全部权限运行，但在某些情况下，你会希望更精细地控制 Pi 可以写入哪些目录、拥有哪些访问权限。

一般有两种选择。你可以
1. 把整个 `pi` 进程放进隔离环境中运行，或
2. 在主机上运行 `pi`，把工具执行路由进隔离环境。

## 选择一种模式 {#choose-a-pattern}

| 模式 | 隔离内容 | 适用场景 | 备注 |
| --- | --- | --- | --- |
| Gondolin 扩展 | 内置工具和 `!` 命令 | 本地微虚拟机隔离，同时把认证留在主机上 | 见 [`examples/extensions/gondolin/`](../examples/extensions/gondolin/)。 |
| 普通 Docker | 整个 `pi` 进程在本地容器中 | 简单的本地隔离 | 提供商 API key 会进入容器。 |
| OpenShell | 整个 `pi` 进程在策略控制的沙箱中 | 本地或远程托管沙箱 | 需要 OpenShell gateway |
| Docker Sandboxes | 整个 `pi` 进程在托管沙箱中 | 本地隔离，同时把提供商密钥留在主机上 | 需要 Docker Sandboxes（`sbx`）。 |

扩展在 `pi` 进程运行的地方运行。如果在主机 `pi` 上使用工具路由扩展，其他自定义扩展工具仍在主机上运行，除非它们也委托自己的操作。

## Gondolin {#gondolin}

[Gondolin](https://github.com/earendil-works/gondolin) 是本地 Linux 微虚拟机。
当你希望 `pi` 留在主机上、但把所有内置工具路由进虚拟机时，使用这个 [示例扩展](../examples/extensions/gondolin)。

配置：

```bash
cp -R packages/coding-agent/examples/extensions/gondolin ~/.pi/agent/extensions/gondolin
cd ~/.pi/agent/extensions/gondolin
npm install --ignore-scripts
```

从你想挂载的项目中运行：

```bash
cd /path/to/project
pi -e ~/.pi/agent/extensions/gondolin
```

该扩展把主机 cwd 挂载到虚拟机中的 `/workspace`，并覆盖 `read`、`write`、`edit`、`bash`、`grep`、`find` 和 `ls`。
用户的 `!` 命令也会路由进虚拟机。
`/workspace` 下的文件更改会写回到主机。

要求：`@earendil-works/gondolin` 需要 Node.js >= 23.6.0，以及 QEMU（需通过包管理器安装）。

## 普通 Docker {#plain-docker}

当你想要最简单的本地容器边界时，把整个 `pi` 进程放进 Docker 运行。

`Dockerfile.pi`：

```dockerfile
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

WORKDIR /workspace
ENTRYPOINT ["pi"]
```

构建并运行：

```bash
docker build -t pi-sandbox -f Dockerfile.pi .

docker run --rm -it \
  -e ANTHROPIC_API_KEY \
  -v "$PWD:/workspace" \
  -v pi-agent-home:/root/.pi/agent \
  pi-sandbox
```

`-v "$PWD:/workspace"` 把当前目录挂载到容器内的 /workspace，因此 Docker 内对 `/workspace` 的读写会直接作用于主机文件，与 Gondolin 示例类似。

若希望设置和会话只存在于容器内，请为 `/root/.pi/agent` 使用 named volume。挂载主机的 `~/.pi/agent` 会把主机认证和会话文件暴露给容器。

## OpenShell {#openshell}

当你需要带有文件系统、进程、网络、凭据和推理控制的策略沙箱时，使用 [NVIDIA OpenShell](https://docs.nvidia.com/openshell/about/overview)。
OpenShell 可以通过由 Docker、Podman 或虚拟机运行时支持的本地 gateway 运行沙箱，也可以通过远程 Kubernetes gateway 运行。

每个沙箱都需要一个活动的 gateway。
创建沙箱前先注册并选择一个：

```bash
openshell gateway add <gateway-url> --name <name>
openshell gateway select <name>
```

在 OpenShell 沙箱中启动 `pi`：

```bash
openshell sandbox create --name pi-sandbox --from pi -- pi
```

在这种模式中，整个 `pi` 进程在沙箱内运行。
内置工具、`!` 命令和扩展工具都在 OpenShell 边界内执行。

如果 gateway 是远程的，项目文件不会从主机 bind-mount，因此沙箱中的写入不会反映到你的机器上。
请在沙箱内克隆仓库，或使用 OpenShell 文件传输命令：

```bash
openshell sandbox upload pi-sandbox ./repo /workspace
openshell sandbox download pi-sandbox /workspace/repo ./repo-out
```

OpenShell 提供商可以把原始模型 API key 留在沙箱外。
配置了推理路由后，沙箱内的代码可以调用 `https://inference.local`，gateway 会在上游注入已配置的提供商凭据。
若希望模型流量走这条路由，请将 Pi 配置为使用对应的 OpenAI 兼容或 Anthropic 兼容端点。

## Docker Sandboxes {#docker-sandboxes}

[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) 是 Docker 提供的托管沙箱运行时，把整个 `pi` 进程放进沙箱运行。
它是 [没有内置沙箱](security.md#no-built-in-sandbox) 所指向的容器边界之一。

与上面的普通 Docker 模式不同，提供商凭据不会传入容器。
沙箱收到的是哨兵值，`sbx` 代理在出站到 `api.anthropic.com` 时替换成真实凭据。
凭据在创建时绑定，因此请在创建沙箱之前把凭据存在主机上。

对于 Claude Pro/Max 订阅，在装有 Claude Code 的机器上运行 `claude setup-token`，然后把结果存在主机上。
如果已经绑定了 `anthropic` secret，请先删除：否则代理会在 Bearer token 旁边再加 `x-api-key` 头，Anthropic 会拒绝请求。
`sbx secret set-custom` 从 stdin 读取 token，因此它不会进入 shell 历史。

```bash
sbx secret rm anthropic

sbx secret set-custom \
  --host api.anthropic.com \
  --env ANTHROPIC_OAUTH_TOKEN \
  --placeholder 'sk-ant-oat01-{rand}'
```

沙箱得到的是 OAuth 形态的占位符，而不是真实 token；代理在出站到该主机时替换它。`ANTHROPIC_OAUTH_TOKEN` 是 pi 已经会读取、并且优先于 API key 的变量，因此不需要额外配置 pi。

对于 API key，改用 `sbx secret set anthropic` 存储。该套件以同样方式接入：作为代理在出站时替换的哨兵值。

凭据存好后，从你想挂载的项目启动 `pi`：

```bash
sbx run --kit "docker.io/sbx/pi-kit:latest" pi
```

该套件已把 `pi` 预装进镜像，因此沙箱启动时无需安装任何东西，当前目录就是沙箱工作区。

不要在沙箱内认证：那里的 `/login` 会把真实 token 写入容器，从而破坏代理模型。

脚本化用法相同：

```bash
sbx exec <sandbox-name> -- pi -p "list the failing tests"
```

完整凭据矩阵、故障排查和固定版本见 [kit 文档](https://github.com/docker/sbx-kits-contrib/tree/main/pi)。

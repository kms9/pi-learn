# `@earendil-works/pi-example-plugin`

该包提供了约定式的 `session` 和 `tui` Chord 切面（facets）。其中 Session-worker 切面提供了一个远程问候服务；TUI 切面则提供了 `/hello` 命令并调用该服务。

该包无需任何构建脚本。Pi 会请求 Chord 自动发现 `src/session.ts` 和 `src/tui.ts`，将这两个入口构建到服务端维护的插件缓存中，并将 TUI 构建产物分发给客户端。

在仓库根目录下运行：

```bash
PI_EXPERIMENTAL=1 ./pi-test.sh server \
  -e "$PWD/packages/coding-agent/examples/plugins/pi-example-plugin"
```

或者，客户端可以在本地服务器上创建或恢复会话（Session）时指定该插件：

```bash
PI_EXPERIMENTAL=1 ./pi-test.sh client \
  -e "$PWD/packages/coding-agent/examples/plugins/pi-example-plugin"
```

可以通过多次使用 `-e` 参数来选择多个插件包。客户端路径会在本地解析，且仅发送给 Unix 服务端；Radius 客户端无法选择服务端的文件系统路径。Session 以及匹配的 TUI 切面会与该 Session 一同存储，因此后续的服务端代次（generations）和客户端无需再带插件参数即可恢复该会话。其他 Session 及其 Worker 不受影响。处于活跃状态的 Session 会拒绝不同的包选择，而不是直接重启。

`server -e` 会设置服务端 profile 的默认 Session 和 TUI 切面。显式启动不带 `-e` 的前台服务端会清除该默认值。客户端的选择绝不会更改服务端的根切面代次。

在 TUI 中运行 `/hello Armin`。在修改切面代码后，运行 `/reload`。服务端会以原子方式重新构建该插件包，重新加载附加的 Session-worker 代次，更新当前的 TUI 代次，并将新的构建产物提供给未来的客户端。

可以通过包元数据覆盖或禁用约定式入口：

```json
{
  "chord": {
    "facets": {
      "session": "./src/worker.ts",
      "tui": false
    }
  }
}
```

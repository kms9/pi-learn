# docs-zh

本目录是 **pi-dev 上游仓库的外部中文阅读层**。

- 上游 clone 在 `../pi-dev/`，保持可 `git pull`，不往里面提交中文。
- 本目录镜像 `pi-dev/` 下的相对路径。
- `foo.zh.md` 迁入后改名为 `foo.md`（与上游英文文件同名、同层级）。
- `kind: annotated-source` 是改过注释的源码副本；上游已还原为英文。
- `kind: original` 是我们新增的中文说明（上游没有对应文件）。

清单见 [manifest.json](manifest.json)。对照上游是否过期：

```bash
python3 ../scripts/sync-zh.py
```

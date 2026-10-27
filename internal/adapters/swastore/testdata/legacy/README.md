# 实际旧版本兼容数据库

`fixture/state.sqlite` 由保存点 `644bbe8701ae1b1c30b54f18621c28e03dbf6082` 的真实 SQLite 全迁移、对象存储、资料仓储、Workspace 空间服务和 `AttentionService.ReferenceMaterial` 生成。公开内容是该提交的 `LICENSE`，实际对象保留在 `fixture/objects/`。生成后关闭数据库、重开、重放原资料引用请求，确认原结果和回执数量不变；随后检查数据库完整性并关闭。

来源及实际 ID、内容摘要、关闭后数据库摘要在 `fixture/source.json`。本原件没有用户数据、账号、模型调用或伪造原生执行。测试每次复制它，通过当前 swastore 应用独立迁移，检查原资料、固定 locator、空间引用、回执和项目授权行不变。原完整资料服务的测试留在准确 Git 历史及源码归档，本原件只证明已有数据库兼容性。

本轮生成时原资料/objects/旧 SQLite/迁移源相对保存点的 `git diff` 为空。仓库根执行：

```sh
source .verification/cloud-setup/activate.sh
go run -mod=readonly internal/adapters/swastore/testdata/legacy/generate.go \
  -output /workspace/swarm-anything/internal/adapters/swastore/testdata/legacy/fixture
```

生成器要求全新绝对输出目录，拒绝覆盖既有原件。实际日志为 `.verification/swa-server-separation-20261023/legacy-fixture-generate-r1.log`，生成成功并确认原请求重放，SQLite 为 757760 字节。

旧产品源码移出后，先按 `docs/LEGACY.md` 恢复准确保存点，将本目录 `generate.go` 放到恢复仓的 `internal/adapters/swastore/testdata/legacy/`，在恢复仓根使用相同 Go 命令，输出到新的验证目录。`testdata` 不进入默认 Go 包发现；在当前 SWA checkout 中不编译生成器。UUID 和创建时间会变化，不要求重新生成相同数据库摘要；新原件须保留自己的来源记录和实际生成结果。

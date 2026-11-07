package main

import "io"

// 仅 Darwin 构建注册只读内核查询，不加载账户或项目配置。
var nativeProcessIdentity func([]string, io.Writer, io.Writer) int

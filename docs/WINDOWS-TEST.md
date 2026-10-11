# Windows 客户端测试版 v0.4.0-test.1

采用 Tauri 2 + WebView2 封装当前本地归档阅读器，安装包自带 Node.js 24 运行时，使用时不必另装 Node。

## 测试
1. 安装 NSIS 安装包，从开始菜单启动 Bili Archive Studio。
2. 在独立窗口中测试首页、工作台、动态、SQLite 索引和媒体缓存。
3. 关闭后重新打开，确认数据保留。
4. 个人数据保存在 Windows 用户 Local AppData 应用目录，不会自动迁移旧版 archive-data。
5. **B 站采集仍需 Edge/Chrome 扩展**；本版不是自动采集完整版。

## 注意
- Windows x64，需要 Edge WebView2 Runtime。
- 本地服务仅监听 127.0.0.1:18765；目前只能同时运行一份。
- 可先备份并拷贝旧的 JSON 文件到客户端的数据目录，重启后重新索引。
- 不要分享登录凭证、archive.sqlite 或私人归档文件。
- 本版本为初次原生打包测试，重点检查启动失败、杀毒误报、数据目录、显示缩放。

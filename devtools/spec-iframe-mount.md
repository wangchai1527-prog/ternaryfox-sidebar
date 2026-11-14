CHANGE SPEC — ternaryfox-sidebar/lib/client.js

背景:DSH GUI 宿主的内容层与文档级捕获处理器压住/拦截注入式 DOM 的所有交互(远程诊断证实:tap 全部命中 DSH 元素、JS .click() 也被拦),注入式挂载在该环境不可用。工程解法:同源 iframe。宿主半区已在同源路径 /tfapp/app/index.html 服务完整 App 产物(无头浏览器实测可正常交互),cookie 与 /tfapi 代理不受 iframe 影响。

任务:把 lib/client.js 中 TernaryTab 的挂载逻辑从「DOMParser 注入 + 动态脚本」改为「同源 iframe」。

要求(只改 lib/client.js,其他文件不动 lib/index.js / devtools/):
1. 移除 DOMParser/shell 解析/脚本加载/i18n island 逻辑。
2. 保留启动探测:先 fetch("/tfapp/app/index.html") 重试探测(沿用现有 30 次/2 秒循环与错误文案),探测 ok 后才渲染 <iframe src="/tfapp/app/index.html" style="border:0;width:100%;height:100%" allow="clipboard-write">;失败走现有 error UI + 重试按钮。
3. 探测成功且 iframe 渲染后调 diag("mount_ok","iframe")。
4. 保留 window error / unhandledrejection / console.error 诊断钩子与 boot beacon(boot 文本改为 "tab opened, plugin v0.2.8");移除 tap 探针与 selftest(iframe 隔离后无意义)。
5. package.json version 升到 0.2.8。

验收判据:
1. [syntax] verify: node --check lib/client.js 通过;环境无 node 则用 python3 做括号配对粗验并在回执注明。
2. [diff] verify: git diff --stat 只含 lib/client.js 与 package.json。
3. [iframe] verify: client.js 含 "/tfapp/app/index.html",不再含 "DOMParser"。

完成后只输出回执三行:
[STATUS] ok 或 fail
[CHANGES] 文件列表 + 一句话
[TESTS] 三条 verify 的结果

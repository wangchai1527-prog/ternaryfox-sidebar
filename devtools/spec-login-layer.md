CHANGE SPEC — ternaryfox-sidebar/lib/client.js

背景:App 产物(app-v0.2.0)没有登录 UI(i18n acct.guest.login="登录功能将随本版本上线"),会话过期后用户无法在侧栏内重新登录(设置页提示 sign in again 但无处可点,登录入口是黑屏占位)。网关登录/注册 API 完整且已验证:POST /tfapi/api/auth/login {email,password},POST /tfapi/api/auth/register {email,password≥8位,注册即登录},GET /tfapi/api/auth/me。cookie tf_session 由响应 Set-Cookie 种在同源(父页面与 /tfapp iframe 共享 cookie jar)。

任务:在 TernaryTab 中加「插件侧登录层」(位于父文档,iframe 上方)。只改 lib/client.js,不动 lib/index.js。

要求:
1. 现有 iframe 挂载逻辑整体保留(探测→iframe→mount_ok beacon→v0.2.9 boot beacon)。
2. mount() 成功后追加:fetch("/tfapi/api/auth/me",{credentials:"same-origin"}) → 若 200 直接进 App(现行为);若 401,在 hostRef 上方(外层容器内、iframe 兄弟节点)渲染登录层 div(position:absolute;inset:0;z-index:10;背景 #0B0E13;内容居中卡片,风格沿用现有 C 色板/字体常量),包含:
   a. 顶部「登录 / 注册」双模式切换(下划线式 Tab,避免像两个按钮);
   b. 邮箱 + 密码输入(注册模式多一个确认密码),输入样式深色卡片;
   c. 提交按钮:登录态文案「进入终端」,注册态「注册并进入」;
   d. 错误行(红 #ff6b6b):401→「邮箱或密码不对」;注册 409→「该邮箱已注册,请切换到登录」;网络错误→「网关不可达」;
   e. 底部灰字说明:「登录后 7 天内免登录」。
3. 提交逻辑:登录 POST /tfapi/api/auth/login,注册 POST /tfapi/api/auth/register;credentials:"same-origin";成功(200/201)→移除登录层 + iframe.contentWindow.location.reload()(让 App 以已登录态重启);失败按 d 显示错误。
4. 登录层存在期间 iframe 保持挂载( Don't block);hidden 切换而非卸载。
5. package.json version → 0.2.9;boot beacon 文本同步 v0.2.9。

验收判据:
1. [syntax] verify: node --check 或 python3 括号配平(无 node 时注明)。
2. [diff] verify: git diff --stat 只含 lib/client.js 与 package.json。
3. [api] verify: client.js 含 "/tfapi/api/auth/me"、"/tfapi/api/auth/login"、"/tfapi/api/auth/register"。
4. [nofold] verify: 未登录时登录层可见且 iframe 仍在 DOM(逻辑上:登录层为兄弟节点覆盖)。

完成后只输出回执三行:[STATUS] / [CHANGES] / [TESTS]。

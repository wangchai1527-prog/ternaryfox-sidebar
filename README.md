# ternaryfox-sidebar

TernaryFox 终端的 DSH 侧栏插件：右侧边栏原生「Ternary 终端」Tab（登录 / 话题列表 / 流式聊天），
不嵌 iframe、零用户配置。

## 架构

```
DSH GUI 侧栏 Tab（client.js，原生 React，betterSidebar tab）
   │  同源 fetch /tfapi/api/agent/chat（SSE 流式）
   ▼
宿主半区（index.js）：/tfapi/* 前缀代理 → http://127.0.0.1:8961（tf-gateway）
   │  转发 cookie / body；Set-Cookie 落在 DSH 同源，无 CORS
   ▼
tf-gateway（/root/ternaryfox/runtime/api，已有，不动）
```

## 安装（用户侧一条命令）

```bash
dsh plugin --profile web add github:<owner>/ternaryfox-sidebar
```

或 GUI 插件市场搜索安装。本地开发用 link：

```bash
dsh plugin --profile web add /root/ternaryfox/code/dsh/ternaryfox-sidebar
```

装完需重启一次 web profile（宿主半区新增了 /tfapi 路由）；之后 client.js 改动走
`patchReload: live` 热生效。

## 配置

gateway 地址默认 `http://127.0.0.1:8961`，可在 profile 的 cordis.patch.yml 覆盖：

```yaml
- insert:
    - id: ternaryfox-sidebar
      name: ternaryfox-sidebar
      config:
        gateway: http://127.0.0.1:8961
```

## 前置条件

tf-gateway 需在本机运行（Tab 内置健康自检，未启动会给出启动命令）：

```bash
cd /root/ternaryfox/runtime/api && .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8961
```

## API 契约（对 tf-gateway，见 runtime/api/openapi.json）

- `POST /api/auth/login` {email,password} → cookie 会话
- `GET  /api/agent/sessions` 话题列表
- `GET  /api/agent/sessions/{sid}/events` 历史事件
- `POST /api/agent/chat`（SSE：session / user_message / assistant_delta / assistant_message /
  tool_call / tool_result / card / turn_done / turn_failed / replay_done）

## Demo 范围（v0.1.0）

登录 + 话题列表 + 新建话题 + 流式聊天（含工具调用提示）。策略/券商/设置面板为后续迭代。

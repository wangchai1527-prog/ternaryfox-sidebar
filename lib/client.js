window.__ModuleLoader__.load({
  id: "ternaryfox-sidebar",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    // ── palette (matches the ternaryfox terminal look) ─────────────────────
    const C = {
      bg: "#0B0E13",
      panel: "#11151d",
      line: "#232b3a",
      text: "#DCE5F2",
      muted: "#8A98AB",
      accent: "#5B8DEF",
      user: "#1c2736",
      err: "#ff6b6b",
      ok: "#28C998",
    };
    const FONT = "12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans CJK SC',sans-serif";
    const API = "/tfapi";

    // ── tiny fetch helpers (same-origin: gateway cookie rides along) ───────
    async function jfetch(path, opts) {
      const res = await fetch(API + path, opts);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const err = new Error((data && (data.detail || data.error || data.message)) || ("HTTP " + res.status));
        err.status = res.status;
        throw err;
      }
      return data;
    }

    // ── SSE chat stream → callback(event, dataObj) ─────────────────────────
    async function chatStream(payload, onEvent) {
      const res = await fetch(API + "/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { const e = new Error("未登录"); e.status = 401; throw e; }
      if (!res.ok || !res.body) {
        const t = await res.text();
        throw new Error("HTTP " + res.status + " " + t.slice(0, 200));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          let ev = "message", data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          let obj = null;
          try { obj = data ? JSON.parse(data) : null; } catch { obj = { raw: data }; }
          onEvent(ev, obj);
        }
      }
    }

    // ── login / register view ─────────────────────────────────────────────
    function LoginView({ onLogin, onRegister, error, busy }) {
      const [mode, setMode] = useState("login"); // login | register
      const [email, setEmail] = useState("");
      const [pw, setPw] = useState("");
      const [pw2, setPw2] = useState("");
      const isReg = mode === "register";
      const canSubmit = isReg
        ? email && pw.length >= 8 && pw === pw2
        : !!(email && pw);
      return h("div", { style: { padding: "18px 14px", font: FONT, color: C.text, display: "flex", flexDirection: "column", gap: "10px", height: "100%", boxSizing: "border-box", justifyContent: "center" } },
        h("div", { style: { fontWeight: 700, fontSize: "14px" } }, "Ternary 终端"),
        // mode switch
        h("div", { style: { display: "flex", gap: "6px" } },
          h("button", { onClick: () => setMode("login"), style: modeBtnS(!isReg) }, "登录"),
          h("button", { onClick: () => setMode("register"), style: modeBtnS(isReg) }, "注册")),
        h("input", { placeholder: "邮箱", value: email, onChange: (e) => setEmail(e.target.value), style: inputS }),
        h("input", { placeholder: isReg ? "密码（至少 8 位）" : "密码", type: "password", value: pw, onChange: (e) => setPw(e.target.value), style: inputS }),
        isReg ? h("input", { placeholder: "确认密码", type: "password", value: pw2, onChange: (e) => setPw2(e.target.value), style: inputS }) : null,
        error ? h("div", { style: { color: C.err, fontSize: "11px" } }, error) : null,
        h("button", { disabled: busy || !canSubmit, onClick: () => isReg ? onRegister(email, pw) : onLogin(email, pw), style: btnS },
          busy ? "提交中…" : (isReg ? "注册并进入" : "进入终端")),
        h("div", { style: { color: C.muted, fontSize: "10.5px", lineHeight: 1.6 } },
          "登录后本设备 ", h("b", { style: { color: C.text } }, "7 天免登录"), "（会话 cookie 自动保持）；期间打开 DSH 即直接进入话题。"));
    }
    const modeBtnS = (active) => ({
      flex: 1, padding: "5px 0", fontSize: "11px", cursor: "pointer",
      border: 0, borderBottom: "2px solid " + (active ? C.accent : "transparent"),
      background: "transparent",
      color: active ? C.text : C.muted, fontWeight: active ? 700 : 400,
    });
    const inputS = { background: C.panel, border: "1px solid " + C.line, borderRadius: 6, color: C.text, padding: "7px 9px", fontSize: "12px", outline: "none" };
    const btnS = { background: C.accent, color: "#fff", border: 0, borderRadius: 6, padding: "8px 0", fontSize: "12px", cursor: "pointer", fontWeight: 600 };

    // ── chat bubbles ───────────────────────────────────────────────────────
    function Bubbles({ msgs }) {
      const ref = useRef(null);
      useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs]);
      return h("div", { ref, style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" } },
        msgs.map((m, i) => h("div", {
          key: i,
          style: {
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "86%",
            background: m.role === "user" ? C.user : C.panel,
            border: "1px solid " + (m.role === "user" ? "transparent" : C.line),
            borderRadius: 8, padding: "6px 9px", font: FONT,
            color: m.failed ? C.err : C.text,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          },
        }, m.text)));
    }

    // ── main tab ───────────────────────────────────────────────────────────
    function TernaryTab() {
      const [phase, setPhase] = useState("boot"); // boot | gateway-down | login | ready
      const [loginErr, setLoginErr] = useState("");
      const [busy, setBusy] = useState(false);
      const [sessions, setSessions] = useState([]);
      const [sid, setSid] = useState(null);
      const [msgs, setMsgs] = useState([]);
      const [input, setInput] = useState("");
      const [streaming, setStreaming] = useState(false);
      const [showList, setShowList] = useState(false);
      const assistantRef = useRef(null);

      // boot: health + auth probe
      useEffect(() => {
        (async () => {
          try {
            await jfetch("/api/health");
          } catch (e) {
            setPhase("gateway-down"); return;
          }
          try {
            await jfetch("/api/auth/me");
            setPhase("ready");
          } catch (e) {
            setPhase(e.status === 401 ? "login" : "gateway-down");
          }
        })();
      }, []);

      const loadSessions = useCallback(async () => {
        try {
          const d = await jfetch("/api/agent/sessions?limit=20");
          setSessions((d && d.sessions) || []);
        } catch (e) {
          if (e.status === 401) setPhase("login");
        }
      }, []);

      useEffect(() => { if (phase === "ready") loadSessions(); }, [phase, loadSessions]);

      async function doAuth(path, email, pw, failMsg) {
        setBusy(true); setLoginErr("");
        try {
          await jfetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
          setPhase("ready");
        } catch (e) {
          setLoginErr(e.status === 401 ? failMsg
            : e.status === 409 ? "该邮箱已注册，请切换到登录"
            : e.status === 422 ? "密码至少 8 位 / 邮箱格式不对"
            : String(e.message || e));
        }
        setBusy(false);
      }
      const doLogin = (email, pw) => doAuth("/api/auth/login", email, pw, "邮箱或密码不对");
      const doRegister = (email, pw) => doAuth("/api/auth/register", email, pw, "登录失败");

      function newTopic() { setSid(null); setMsgs([]); setInput(""); }

      async function pickSession(id) {
        setSid(id); setMsgs([]); setShowList(false);
        try {
          const d = await jfetch("/api/agent/sessions/" + encodeURIComponent(id) + "/events");
          const rows = (d && (d.items || d.events)) || [];
          setMsgs(rows.map((ev) => {
            const role = ev.role || (ev.kind || "").split("_")[0];
            return { role: role === "user" ? "user" : "assistant", text: ev.text || ev.content || ev.summary || JSON.stringify(ev.data || ev) };
          }));
        } catch (e) {
          setMsgs([{ role: "assistant", text: "（拉取历史失败：" + (e.message || e) + "，可直接继续发消息）" }]);
        }
      }

      async function send() {
        const text = input.trim();
        if (!text || streaming) return;
        setInput(""); setStreaming(true);
        setMsgs((m) => m.concat({ role: "user", text }));
        let acc = "";
        setMsgs((m) => m.concat({ role: "assistant", text: "" }));
        try {
          await chatStream({ message: text, session_id: sid }, (ev, obj) => {
            if (ev === "session" && obj && obj.id && !sid) setSid(obj.id);
            else if (ev === "user_message") { /* echoed */ }
            else if (ev === "assistant_delta") {
              acc += (obj && (obj.delta || obj.text || obj.content)) || "";
              setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", text: acc }; return c; });
            } else if (ev === "assistant_message") {
              acc = (obj && (obj.text || obj.content || obj.message)) || acc;
              setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", text: acc }; return c; });
            } else if (ev === "tool_call") {
              acc += "\n[工具] " + ((obj && (obj.name || obj.tool)) || "");
              setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", text: acc }; return c; });
            } else if (ev === "turn_failed") {
              setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", text: acc + "\n[回合失败] " + JSON.stringify(obj), failed: true }; return c; });
            } else if (ev === "turn_done") {
              loadSessions();
            }
          });
        } catch (e) {
          if (e.status === 401) { setPhase("login"); setMsgs((m) => m.slice(0, -2)); }
          else setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", text: "请求失败：" + (e.message || e), failed: true }; return c; });
        }
        setStreaming(false);
      }

      if (phase === "boot") return h("div", { style: { ...rootS, alignItems: "center", justifyContent: "center", color: C.muted } }, "连接 tf-gateway…");
      if (phase === "gateway-down") return h("div", { style: { ...rootS, padding: "18px 14px", gap: "8px" } },
        h("div", { style: { color: C.err, fontWeight: 700 } }, "tf-gateway 不可达"),
        h("div", { style: { color: C.muted } }, "请先在本机启动 gateway："),
        h("code", { style: { color: C.text, background: C.panel, padding: "6px 8px", borderRadius: 6, display: "block" } },
          "cd /root/ternaryfox/runtime/api && .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8961"),
        h("div", { style: { color: C.muted } }, "启动后点重试"),
        h("button", { onClick: () => location.reload(), style: { ...btnS, width: 80 } }, "重试"));
      if (phase === "login") return h(LoginView, { onLogin: doLogin, onRegister: doRegister, error: loginErr, busy });

      // ready
      const cur = sessions.find((s) => s.id === sid);
      return h("div", { style: rootS },
        // header
        h("div", { style: headS },
          h("span", { style: { width: 6, height: 6, borderRadius: "50%", background: C.ok, display: "inline-block" } }),
          h("span", { style: { fontWeight: 700, fontSize: "12.5px", flex: 0, whiteSpace: "nowrap" } }, "Ternary"),
          h("span", { style: { color: C.muted, fontSize: "10.5px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, cur ? (cur.title || sid.slice(0, 8)) : "新话题"),
          h("button", { style: linkBtnS, onClick: () => setShowList((v) => !v) }, "话题"),
          h("button", { style: linkBtnS, onClick: newTopic }, "＋新建")),
        showList ? h("div", { style: { flex: "0 0 auto", maxHeight: "35%", overflowY: "auto", borderBottom: "1px solid " + C.line, background: C.panel } },
          sessions.length === 0 ? h("div", { style: { padding: "8px 10px", color: C.muted, font: FONT } }, "暂无历史话题") :
          sessions.map((s) => h("div", {
            key: s.id,
            onClick: () => pickSession(s.id),
            style: { padding: "7px 10px", font: FONT, cursor: "pointer", color: s.id === sid ? C.accent : C.text, borderBottom: "1px solid " + C.line },
          }, h("div", null, s.title || s.id.slice(0, 12)), h("div", { style: { color: C.muted, fontSize: "10px" } }, s.category + " · " + new Date((s.updated_at || 0) * 1000).toLocaleString())))) : null,
        // messages
        h(Bubbles, { msgs }),
        // composer
        h("div", { style: { flex: "0 0 auto", display: "flex", gap: "6px", padding: "8px", borderTop: "1px solid " + C.line, background: C.panel } },
          h("input", {
            value: input, onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } },
            placeholder: streaming ? "回复生成中…" : "发送消息给 Ternary agent…",
            disabled: streaming, style: { ...inputS, flex: 1 },
          }),
          h("button", { onClick: send, disabled: streaming || !input.trim(), style: { ...btnS, width: 58, disabled: streaming } }, "发送")));
    }

    const rootS = { height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, color: C.text, font: FONT, boxSizing: "border-box" };
    const headS = { flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderBottom: "1px solid " + C.line, background: C.panel };
    const linkBtnS = { background: "transparent", border: "1px solid " + C.line, color: C.text, borderRadius: 5, fontSize: "10.5px", padding: "3px 8px", cursor: "pointer" };

    const inject = ["betterSidebar"];
    function apply(ctx) {
      ctx.effect(() => ctx.betterSidebar.registerTab({
        id: "ternaryfox:tab",
        title: "Ternary 终端",
        single: true,
        component: TernaryTab,
      }), "ternaryfox-sidebar: ternary terminal tab");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

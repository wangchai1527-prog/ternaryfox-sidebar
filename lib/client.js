window.__ModuleLoader__.load({
  id: "ternaryfox-sidebar",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const C = {
      bg: "#0B0E13",
      line: "#232b3a",
      text: "#DCE5F2",
      muted: "#8A98AB",
      accent: "#5B8DEF",
      err: "#ff6b6b",
    };
    const FONT = "12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans CJK SC',sans-serif";

    /**
     * TernaryTab — mounts the pinned GitHub release of the ternaryfox /app
     * (served by the host half at /tfapp) inside a same-origin iframe in the
     * sidebar tab. The host page's content layer intercepts injected-DOM
     * interactions, so a same-origin iframe isolates the app's events while
     * keeping cookies and the /tfapi proxy (→ tf-gateway) fully usable.
     */
    function TernaryTab() {
      const hostRef = useRef(null);
      const iframeRef = useRef(null);
      const [state, setState] = useState("loading"); // loading | ready | error
      const [step, setStep] = useState("启动…");
      const [err, setErr] = useState("");
      // auth: "checking" | "gate" | "ok" — 登录层挂在外层容器（iframe 兄弟节点），
      // 用 hidden/display 切换而非卸载；存在期间 iframe 保持挂载。
      const [auth, setAuth] = useState("checking");

      useEffect(() => {
        let cancelled = false;
        async function mount() {
          setStep("探测 /tfapp/app");
          let probe;
          for (let i = 0; i < 30; i++) {
            try { probe = await fetch("/tfapp/app/index.html", { cache: "no-store" }); }
            catch (e) { probe = null; }
            if (probe && (probe.ok || probe.status === 500)) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
          if (!probe) throw new Error("插件服务不可达");
          if (probe.status === 503) throw new Error("App 产物还在下载中，稍后重开此 Tab");
          if (probe.status === 500) {
            const d = await probe.json().catch(() => ({}));
            throw new Error("App 产物拉取失败：" + (d.detail || d.error || ""));
          }
          if (!probe.ok) throw new Error("App shell HTTP " + probe.status);

          if (cancelled) return;
          setStep("挂载 iframe");
          const iframe = document.createElement("iframe");
          iframe.src = "/tfapp/app/index.html";
          iframe.setAttribute("style", "border:0;width:100%;height:100%");
          iframe.setAttribute("allow", "clipboard-write");
          hostRef.current.style.cssText =
            "position:absolute;inset:0;contain:paint;isolation:isolate";
          hostRef.current.appendChild(iframe);
          iframeRef.current = iframe;

          setStep("就绪");
          setState("ready");
          diag("mount_ok", "iframe");

          // 会话检查：200 直接进 App；401 弹出插件侧登录层（iframe 不卸载）
          try {
            const me = await fetch("/tfapi/api/auth/me", { credentials: "same-origin" });
            if (!cancelled) setAuth(me.status === 401 ? "gate" : "ok");
          } catch (e) {
            if (!cancelled) setAuth("ok"); // 网关不可达时不拦 App，交给 App 内部报错
          }
        }
        mount().catch((e) => {
          if (!cancelled) {
            setErr(String(e.message || e)); setState("error");
            try { navigator.sendBeacon?.("/tfdiag/log", new Blob(
              [JSON.stringify({ kind: "mount_failed", message: String(e && e.message || e).slice(0, 800) })],
              { type: "application/json" })); } catch {}
          }
        });
        try { navigator.sendBeacon?.("/tfdiag/log", new Blob(
          [JSON.stringify({ kind: "boot", message: "tab opened, plugin v0.2.9" })],
          { type: "application/json" })); } catch {}
        return () => { cancelled = true; };
      }, []);

      return h("div", { style: { height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, font: FONT } },
        h("div", { style: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderBottom: "1px solid " + C.line, color: C.muted, fontSize: "10.5px" } },
          h("span", { style: { width: 6, height: 6, borderRadius: "50%", background: state === "ready" ? "#28C998" : "#F5A623", display: "inline-block" } }),
          h("span", { style: { color: C.text, fontWeight: 700 } }, "Ternary 终端"),
          state !== "ready" ? h("span", { style: { color: C.muted } }, step) : h("span", null, "GitHub release 挂载 · 经 /tfapi 连接本地 gateway")),
        state === "error"
          ? h("div", { style: { padding: "16px 14px", color: C.err, display: "grid", gap: "8px" } },
              h("div", null, "挂载失败：", err),
              h("button", { onClick: () => location.reload(), style: { width: 80, background: C.accent, color: "#fff", border: 0, borderRadius: 6, padding: "7px 0", cursor: "pointer" } }, "重试"))
          : null,
        h("div", { style: { flex: 1, minHeight: 0, position: "relative", opacity: state === "ready" ? 1 : 0.35, transition: "opacity .3s" } },
          h("div", { ref: hostRef, style: { position: "absolute", inset: 0 } }),
          state !== "ready" ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, pointerEvents: "none" } }, "挂载 ternaryfox /app …") : null,
          h(AuthGate, {
            hidden: auth !== "gate",
            onSuccess: () => {
              setAuth("ok");
              try { iframeRef.current?.contentWindow?.location?.reload?.(); } catch (e) { diag("auth_reload_failed", String(e && e.message || e)); }
            },
          })));
    }

    /**
     * AuthGate — 插件侧登录层：位于父文档、iframe 上方的兄弟覆盖层
     * (position:absolute;inset:0;z-index:10)，深色卡片风格沿用 C 色板。
     * 通过 hidden 切换显隐，组件本身不卸载。
     */
    function AuthGate({ hidden, onSuccess }) {
      const [mode, setMode] = useState("login"); // login | register
      const [email, setEmail] = useState("");
      const [pass, setPass] = useState("");
      const [pass2, setPass2] = useState("");
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");

      async function submit(ev) {
        ev && ev.preventDefault && ev.preventDefault();
        setError("");
        if (!email || !pass || (mode === "register" && !pass2)) {
          setError("请填写邮箱与密码"); return;
        }
        if (mode === "register") {
          if (pass.length < 8) { setError("密码至少 8 位"); return; }
          if (pass !== pass2) { setError("两次密码不一致"); return; }
        }
        setBusy(true);
        let res = null;
        try {
          res = await fetch(mode === "login" ? "/tfapi/api/auth/login" : "/tfapi/api/auth/register", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: pass }),
          });
        } catch (e) {
          res = null; // 网络层失败 → 网关不可达
        }
        setBusy(false);
        if (res && (res.status === 200 || res.status === 201)) {
          onSuccess();
          return;
        }
        if (!res) { setError("网关不可达"); return; }
        if (mode === "register" && res.status === 409) { setError("该邮箱已注册，请切换到登录"); return; }
        if (mode === "login" && res.status === 401) { setError("邮箱或密码不对"); return; }
        if (mode === "register" && res.status === 422) { setError("密码至少 8 位"); return; }
        setError("登录失败（HTTP " + res.status + "）");
      }

      const inputStyle = {
        width: "100%", boxSizing: "border-box",
        background: "#11151d", border: "1px solid " + C.line, borderRadius: 6,
        color: C.text, padding: "8px 10px", font: FONT, outline: "none",
      };
      const tabStyle = (on) => ({
        flex: 1, padding: "8px 0 9px", cursor: "pointer", textAlign: "center",
        color: on ? C.text : C.muted, fontWeight: on ? 700 : 400,
        background: "none", border: 0, borderTop: 0, borderLeft: 0, borderRight: 0,
        borderBottom: "2px solid " + (on ? C.accent : "transparent"),
      });

      return h("div", {
        style: {
          position: "absolute", inset: 0, zIndex: 10,
          background: C.bg, display: hidden ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
        },
      },
        h("form", {
          onSubmit: submit,
          style: {
            width: 260, background: "#0F131B", border: "1px solid " + C.line,
            borderRadius: 10, padding: "18px 18px 14px", display: "grid", gap: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,.45)",
          },
        },
          // a. 双模式切换：下划线式 Tab
          h("div", { style: { display: "flex", borderBottom: "1px solid " + C.line, gap: 4, marginBottom: 2 } },
            h("button", { type: "button", style: tabStyle(mode === "login"), onClick: () => { setMode("login"); setError(""); } }, "登录"),
            h("button", { type: "button", style: tabStyle(mode === "register"), onClick: () => { setMode("register"); setError(""); } }, "注册")),
          // b. 输入
          h("input", { type: "email", placeholder: "邮箱", value: email, autoComplete: "username",
            style: inputStyle, onChange: (e) => setEmail(e.target.value) }),
          h("input", { type: "password", placeholder: mode === "register" ? "密码（至少 8 位）" : "密码", value: pass, autoComplete: mode === "register" ? "new-password" : "current-password",
            style: inputStyle, onChange: (e) => setPass(e.target.value) }),
          mode === "register"
            ? h("input", { type: "password", placeholder: "确认密码", value: pass2, autoComplete: "new-password",
                style: inputStyle, onChange: (e) => setPass2(e.target.value) })
            : null,
          // d. 错误行
          error ? h("div", { style: { color: C.err, font: FONT, minHeight: 14 } }, error) : h("div", { style: { minHeight: 14 } }),
          // c. 提交按钮
          h("button", {
            type: "submit", disabled: busy,
            style: {
              width: "100%", background: C.accent, color: "#fff", border: 0,
              borderRadius: 6, padding: "9px 0", cursor: busy ? "default" : "pointer",
              font: FONT, fontWeight: 700, opacity: busy ? 0.6 : 1,
            },
          }, busy ? "连接中…" : mode === "login" ? "进入终端" : "注册并进入"),
          // e. 底部说明
          h("div", { style: { color: C.muted, textAlign: "center", font: FONT }, }, "登录后 7 天内免登录")));
    }

    const inject = ["betterSidebar"];

    // ---- remote diagnostics (mobile has no F12): ship errors to /tfdiag/log ----
    function diag(kind, message) {
      try {
        navigator.sendBeacon?.("/tfdiag/log",
          new Blob([JSON.stringify({ kind, message: String(message).slice(0, 800) })],
            { type: "application/json" }));
      } catch {}
    }
    function installDiag() {
      if (window.__tfDiag) return;
      window.__tfDiag = true;
      const send = diag;
      window.addEventListener("error", (e) =>
        send("error", (e.message || "error") + (e.filename ? " @" + e.filename + ":" + e.lineno : "")));
      window.addEventListener("unhandledrejection", (e) =>
        send("rejection", (e.reason && (e.reason.stack || e.reason.message)) || e.reason || "rejection"));
      const origErr = console.error.bind(console);
      console.error = function (...a) {
        send("console", a.map((x) => (x && x.stack) || String(x)).join(" ").slice(0, 800));
        origErr(...a);
      };
    }

    function apply(ctx) {
      apply.diagHook = installDiag;
      installDiag();
      ctx.effect(() => ctx.betterSidebar.registerTab({
        id: "ternaryfox:tab",
        title: "Ternary 终端",
        single: true,
        component: TernaryTab,
      }), "ternaryfox-sidebar: ternary terminal tab (release loader)");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

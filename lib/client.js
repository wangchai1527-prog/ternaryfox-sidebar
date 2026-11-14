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
      const [state, setState] = useState("loading"); // loading | ready | error
      const [step, setStep] = useState("启动…");
      const [err, setErr] = useState("");

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

          setStep("就绪");
          setState("ready");
          diag("mount_ok", "iframe");
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
          [JSON.stringify({ kind: "boot", message: "tab opened, plugin v0.2.8" })],
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
          state !== "ready" ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, pointerEvents: "none" } }, "挂载 ternaryfox /app …") : null));
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

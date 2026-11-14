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
     * (served by the host half at /tfapp) natively inside the sidebar tab.
     * No iframe: the app's HTML/CSS/JS are injected into the tab container,
     * and its JS was rewritten server-side to call /tfapi (→ tf-gateway).
     */
    function TernaryTab() {
      const hostRef = useRef(null);
      const [state, setState] = useState("loading"); // loading | ready | error
      const [step, setStep] = useState("启动…");
      const [err, setErr] = useState("");

      useEffect(() => {
        let cancelled = false;
        const KEY = "__tfAppNode";
        async function mount() {
          setStep("请求 /tfapp shell");
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
          setStep("解析 app shell");
          const html = await probe.text();
          const doc = new DOMParser().parseFromString(html, "text/html");

          // stylesheets (href already rewritten to /tfapp by the host)
          const cssHrefs = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href"));

          const container = document.createElement("div");
          container.style.cssText = "height:100%;min-height:0;display:flex;flex-direction:column;background:#FBFCFD;";
          // app root + i18n island
          const root = doc.querySelector(".tfapp");
          const i18n = doc.querySelector("#app-i18n");
          if (!root) throw new Error("app shell 未找到 .tfapp 根节点");
          if (i18n) container.appendChild(i18n.cloneNode(true));
          container.appendChild(root);
          // boot script(s), rewritten to /tfapp
          const srcs = [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));

          for (const href of cssHrefs) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href + (href.includes("?") ? "&" : "?") + "tf=1";
            container.appendChild(link);
          }
          // make the app fill the tab
          root.style.height = "100%";
          const body = root.querySelector(".app-body") || root;
          if (root.querySelector(".app-body")) root.querySelector(".app-body").style.flex = "1 1 auto";

          if (cancelled) return;
          setStep("挂载 DOM");
          let node = window[KEY];
          if (!node || !node.isConnected) {
            node = container;
            window[KEY] = node;
          }
          // mount point is a dedicated div with ZERO React children —
          // React never removes nodes inside it (avoids removeChild clashes)
          hostRef.current.appendChild(node);

          let n = 0;
          for (const src of srcs) {
            n++;
            setStep("加载脚本 " + n + "/" + srcs.length);
            if (window[KEY + ":booted:" + src]) continue; // execute once per page
            await new Promise((resolve, reject) => {
              const s = document.createElement("script");
              s.type = "module";
              s.src = src;
              s.onload = resolve;
              s.onerror = () => reject(new Error("脚本加载失败：" + src));
              container.appendChild(s);
              window[KEY + ":booted:" + src] = true;
            });
          }
          setStep("就绪");
          setState("ready");
        }
        mount().catch((e) => { if (!cancelled) { setErr(String(e.message || e)); setState("error"); } });
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
    function apply(ctx) {
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

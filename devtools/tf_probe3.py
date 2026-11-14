import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3080"
MODE = sys.argv[1] if len(sys.argv) > 1 else "embed"
EXE = "/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=EXE, args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 500, "height": 900})
        r = await ctx.request.post(BASE + "/tfapi/api/auth/login",
            data={"email": "probe-rctest@tf.test", "password": "probe-test-1234"})
        print("login:", r.status)
        console, pageerrors = [], []
        page = await ctx.new_page()
        page.on("console", lambda m: console.append((m.type, m.text[:250])))
        page.on("pageerror", lambda e: pageerrors.append(str(e)[:400]))
        if MODE == "embed":
            # emulate exactly what the plugin client does, without DSH GUI
            await page.goto(BASE + "/tfapi/api/auth/me", wait_until="domcontentloaded")
            await page.evaluate("""async () => {
              const probe = await fetch('/tfapp/app/index.html', {cache:'no-store'});
              const html = await probe.text();
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const container = document.createElement('div');
              container.id='tfembed';
              container.style.cssText='position:fixed;inset:0;display:flex;flex-direction:column;background:#FBFCFD;';
              const root = doc.querySelector('.tfapp');
              const i18n = doc.querySelector('#app-i18n');
              if (i18n) container.appendChild(i18n.cloneNode(true));
              container.appendChild(root);
              root.style.height='100%';
              for (const l of [...doc.querySelectorAll('link[rel=stylesheet]')]) {
                const link=document.createElement('link'); link.rel='stylesheet';
                link.href=l.getAttribute('href')+'?tf=1'; container.appendChild(link);
              }
              document.body.replaceChildren(container);
              const srcs=[...doc.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
              for (const src of srcs) {
                await new Promise((res,rej)=>{const s=document.createElement('script');s.type='module';s.src=src;s.onload=res;s.onerror=rej;container.appendChild(s);});
              }
              return 'mounted';
            }""")
            await page.wait_for_timeout(5000)
        probe = await page.evaluate("""() => ({
            tfapp: !!document.querySelector('.tfapp'),
            booted: !!window.__tfAppNode,
            drawerBtns: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t).slice(0,10),
        })""")
        print("=== PROBE ==="); print(json.dumps(probe, ensure_ascii=False, indent=1))
        # click hamburger to open drawer, then try real composer send
        try:
            await page.get_by_text("☰").first.click(timeout=4000)
            await page.wait_for_timeout(1200)
            print("drawer opened, items:", await page.evaluate("() => document.body.innerText.slice(0,300).replace(/\\n/g,' | ')"))
        except Exception as e: print("drawer err:", str(e)[:150])
        print("=== PAGE ERRORS ===")
        for e in pageerrors: print(e)
        print("=== CONSOLE err ===")
        for t, m in console:
            if t == "error": print(f"[{t}] {m}")
        await page.screenshot(path=f"/root/ternaryfox/tf_{MODE}.png")
        await browser.close()

asyncio.run(main())

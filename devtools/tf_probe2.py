import asyncio, json
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3080"
EXE = "/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=EXE, args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 500, "height": 900})
        # login via API to get tf_session cookie
        resp = await ctx.request.post(BASE + "/tfapi/api/auth/login",
            data={"email": "probe-rctest@tf.test", "password": "probe-test-1234"})
        print("login:", resp.status)
        console, pageerrors = [], []
        page = await ctx.new_page()
        page.on("console", lambda m: console.append((m.type, m.text[:250])))
        page.on("pageerror", lambda e: pageerrors.append(str(e)[:400]))
        await page.goto(BASE + "/tfapp/app/index.html", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(4000)
        probe = await page.evaluate("""() => ({
            tfapp: !!document.querySelector('.tfapp'),
            appBody: !!document.querySelector('.app-body'),
            drawerBtn: !!document.querySelector('.mode-bar, header, .app-header'),
            sendBtn: [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t).slice(0,12),
        })""")
        print("=== BOOT PROBE ==="); print(json.dumps(probe, ensure_ascii=False, indent=1))
        # try opening the drawer (hamburger)
        try:
            await page.locator("button, .icon-btn, [aria-label]").first.click(timeout=3000)
            await page.wait_for_timeout(1000)
        except Exception as e: print("drawer click err:", str(e)[:100])
        # try typing + sending a message
        sent = False
        try:
            ta = page.locator("textarea").first
            await ta.fill("只回复ok", timeout=5000)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(6000)
            body = await page.evaluate("() => document.querySelector('.app-body')?.innerText?.slice(0,400) || ''")
            print("=== AFTER SEND body text ==="); print(body[:400])
            sent = True
        except Exception as e:
            print("send err:", str(e)[:200])
        print("=== PAGE ERRORS ===")
        for e in pageerrors: print(e)
        print("=== CONSOLE ===")
        for t, m in console:
            if t in ("error", "warning"): print(f"[{t}] {m}")
        await page.screenshot(path="/root/ternaryfox/tfapp_direct.png")
        await browser.close()

asyncio.run(main())

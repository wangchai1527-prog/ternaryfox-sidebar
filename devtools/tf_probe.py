import asyncio, json
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:3080"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True,
            executable_path="/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell",
            args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 900, "height": 1400})
        console, pageerrors = [], []
        page.on("console", lambda m: console.append((m.type, m.text[:300])))
        page.on("pageerror", lambda e: pageerrors.append(str(e)[:500]))
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)
        cnt = await page.locator("text=Ternary 终端").count()
        print("Ternary triggers found:", cnt)
        if cnt:
            await page.locator("text=Ternary 终端").first.click(timeout=10000)
            await page.wait_for_timeout(6000)
        print("=== PAGE ERRORS ===")
        for e in pageerrors: print(e)
        print("=== CONSOLE errors/warnings ===")
        for t, m in console:
            if t in ("error", "warning"): print(f"[{t}] {m}")
        probe = await page.evaluate("""() => ({
            tfapp: !!document.querySelector('.tfapp'),
            appBody: !!document.querySelector('.app-body'),
            composer: !!document.querySelector('textarea, .composer, [contenteditable]'),
            tfAppNode: !!window.__tfAppNode,
            booted: Object.keys(window).filter(k=>k.startsWith('__tfAppNode:booted')),
        })""")
        print("=== PROBE ==="); print(json.dumps(probe, ensure_ascii=False, indent=1))
        await page.screenshot(path="/root/ternaryfox/tf_sidebar.png")
        await browser.close()

asyncio.run(main())

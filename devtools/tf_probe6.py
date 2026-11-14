import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:3080"
EXE="/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell"
MOUNT=open('/root/ternaryfox/tf_probe5.py').read().split('MOUNT="""')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=EXE,args=["--no-sandbox"])
        ctx=await browser.new_context(viewport={"width":500,"height":900})
        await ctx.request.post(BASE+"/tfapi/api/auth/login",data={"email":"probe-rctest@tf.test","password":"probe-test-1234"})
        page=await ctx.new_page()
        errs=[]; page.on("pageerror",lambda e:errs.append(str(e)[:300]))
        await page.goto(BASE+"/tfapi/api/auth/me",wait_until="domcontentloaded")
        await page.evaluate(MOUNT)
        await page.wait_for_timeout(4000)
        await page.evaluate("""async()=>{
          const ta=document.getElementById('agent-input');
          ta.focus(); ta.value='只回复ok';
          ta.dispatchEvent(new Event('input',{bubbles:true}));
          await new Promise(r=>setTimeout(r,300));
          const send=[...document.querySelectorAll('button')].find(b=>/^send$/i.test(b.textContent.trim()));
          send.click(); return 'sent';
        }""")
        for i in range(6):
            await page.wait_for_timeout(2000)
            t=await page.evaluate("()=>document.body.innerText.slice(-300).replace(/\\n+/g,' | ')")
            print(f"t+{(i+1)*2}s:", t[-220:])
        print("=== ERRORS ===")
        for e in errs: print(e)
        await page.screenshot(path="/root/ternaryfox/tf_closedloop.png")
        await browser.close()
asyncio.run(main())

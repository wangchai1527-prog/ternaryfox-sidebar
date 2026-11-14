import asyncio, json
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3080"
EXE = "/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=EXE, args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 500, "height": 900})
        await ctx.request.post(BASE + "/tfapi/api/auth/login",
            data={"email": "probe-rctest@tf.test", "password": "probe-test-1234"})
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:300]))
        await page.goto(BASE + "/tfapi/api/auth/me", wait_until="domcontentloaded")
        await page.evaluate("""async () => {
          const probe = await fetch('/tfapp/app/index.html', {cache:'no-store'});
          const html = await probe.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const container = document.createElement('div');
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
          for (const src of [...doc.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))) {
            await new Promise((res,rej)=>{const s=document.createElement('script');s.type='module';s.src=src;s.onload=res;s.onerror=rej;container.appendChild(s);});
          }
        }""")
        await page.wait_for_timeout(4000)
        # find the composer
        info = await page.evaluate("""() => {
          const tas=[...document.querySelectorAll('textarea')].map(t=>({id:t.id,ph:t.placeholder}));
          const ce=[...document.querySelectorAll('[contenteditable]')].map(t=>({id:t.id,ph:t.getAttribute('placeholder')}));
          return {tas,ce};
        }""")
        print("composers:", json.dumps(info, ensure_ascii=False))
        # type into the main composer (not skill-prompt), press Enter
        ok = await page.evaluate("""async () => {
          const ta=[...document.querySelectorAll('input,textarea')].find(t=>/ask|portfolio/i.test(t.placeholder||''))
            || [...document.querySelectorAll('input[type=text],textarea')].filter(t=>t.id!=='skill-prompt'&&t.id!=='asset-code').pop();
          if(!ta) return 'no composer textarea';
          ta.focus(); ta.value='只回复ok';
          ta.dispatchEvent(new Event('input',{bubbles:true}));
          await new Promise(r=>setTimeout(r,300));
          // find send button
          const btn=[...document.querySelectorAll('button')].find(b=>/send|发送/i.test(b.textContent)||b.querySelector('svg[aria-label*="send" i]'));
          if(btn){btn.click();return 'clicked send btn';}
          ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          return 'dispatched Enter';
        }""")
        print("send action:", ok)
        await page.wait_for_timeout(8000)
        tail = await page.evaluate("() => document.body.innerText.slice(-500).replace(/\\n+/g,' | ')")
        print("=== PAGE TAIL AFTER SEND ==="); print(tail)
        print("=== PAGE ERRORS ===")
        for e in errs: print(e)
        await page.screenshot(path="/root/ternaryfox/tf_send.png")
        await browser.close()

asyncio.run(main())

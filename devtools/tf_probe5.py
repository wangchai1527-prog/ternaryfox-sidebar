import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:3080"
EXE="/root/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell"
MOUNT="""async () => {
  const probe = await fetch('/tfapp/app/index.html', {cache:'no-store'});
  const html = await probe.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');
  container.style.cssText='position:fixed;inset:0;display:flex;flex-direction:column;background:#FBFCFD;';
  const root = doc.querySelector('.tfapp');
  const i18n = doc.querySelector('#app-i18n');
  if (i18n) container.appendChild(i18n.cloneNode(true));
  container.appendChild(root); root.style.height='100%';
  for (const l of [...doc.querySelectorAll('link[rel=stylesheet]')]) {
    const link=document.createElement('link'); link.rel='stylesheet';
    link.href=l.getAttribute('href')+'?tf=1'; container.appendChild(link);}
  document.body.replaceChildren(container);
  for (const src of [...doc.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))) {
    await new Promise((res,rej)=>{const s=document.createElement('script');s.type='module';s.src=src;s.onload=res;s.onerror=rej;container.appendChild(s);});}
}"""
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=EXE,args=["--no-sandbox"])
        ctx=await browser.new_context(viewport={"width":500,"height":900})
        await ctx.request.post(BASE+"/tfapi/api/auth/login",data={"email":"probe-rctest@tf.test","password":"probe-test-1234"})
        page=await ctx.new_page()
        await page.goto(BASE+"/tfapi/api/auth/me",wait_until="domcontentloaded")
        await page.evaluate(MOUNT)
        await page.wait_for_timeout(4000)
        info=await page.evaluate("""()=>[...document.querySelectorAll('input,textarea,[contenteditable],[data-placeholder]')].map(e=>({tag:e.tagName,id:e.id,ph:e.placeholder||e.getAttribute('data-placeholder'),vis:!!(e.offsetWidth||e.offsetHeight)}))""")
        print(json.dumps(info,ensure_ascii=False,indent=1))
        # composer by id guess: list ids near bottom
        ids=await page.evaluate("()=>[...document.querySelectorAll('[id]')].map(e=>e.id).filter(Boolean)")
        print("ids:",ids)
        await browser.close()
asyncio.run(main())

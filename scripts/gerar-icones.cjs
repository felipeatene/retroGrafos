const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const svg = fs.readFileSync(path.join(raiz, "extensao/assets/mascote/lino-pet.svg"), "utf8")
  .replace('viewBox="0 0 176 220"', 'viewBox="24 8 128 128"');
const pasta = path.join(raiz, "extensao/assets/icones");
fs.mkdirSync(pasta, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  for (const tamanho of [16, 32, 48, 128]) {
    await page.locator("svg").evaluate((el, px) => { el.style.width = px + "px"; el.style.height = px + "px"; }, tamanho);
    await page.locator("svg").screenshot({
      path: path.join(pasta, `lino-${tamanho}.png`),
      omitBackground: true,
    });
  }
  await browser.close();
  console.log(pasta);
})().catch(erro => { console.error(erro); process.exit(1); });

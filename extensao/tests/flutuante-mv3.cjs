const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const origem = 'https://dev217534.service-now.com';
const id = 'a'.repeat(32);
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'lino-mv3-'));
const extensao = path.join(pasta, 'extensao');
const output = path.resolve(__dirname, '../../output/mascote-preview');
fs.mkdirSync(output, {recursive: true});

async function testar() {
  fs.cpSync(path.resolve(__dirname, '..'), extensao, {recursive: true});
  const manifestPath = path.join(extensao, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.side_panel, undefined);
  assert.ok(!manifest.permissions.includes('sidePanel'));
  // Grant access only in the disposable fixture profile. No live instance traffic.
  manifest.host_permissions = [origem + '/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(pasta, 'perfil'), {
    channel: 'chromium', executablePath: process.env.LINO_CHROMIUM || undefined, headless: true,
    args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`],
  });
  let liberarGrafo;
  const primeiraCarga = new Promise(resolve => { liberarGrafo = resolve; });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const raiz = worker.url().split('/').slice(0, 3).join('/');
    const aplicados = [];
    await context.route(origem + '/**', async route => {
      const rota = new URL(route.request().url()).pathname;
      if (rota === '/incident_list.do') {
        await route.fulfill({contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><h1>Incidentes DEMO</h1><table id="incident_table"><thead><tr><th>Número</th><th>Descrição</th></tr></thead><tbody><tr><td><a href="/incident.do?sys_id=${id}">DEMO001</a></td><td headers="short_description">Divergência de estoque</td></tr></tbody></table>`});
        return;
      }
      if (rota === '/api/global/lino/acesso') { await route.fulfill({json: {result: {usuario: id}}}); return; }
      if (rota === '/api/global/lino/grafo') {
        await primeiraCarga;
        await route.fulfill({json: {result: {itens: [], proximo: ''}}});
        return;
      }
      if (rota === '/api/global/lino/classificar') {
        const {ids} = route.request().postDataJSON();
        aplicados.push(...ids);
        await route.fulfill({json: {result: {itens: ids.map(item => ({id: item, estado: 'analisado', numero: 'DEMO001', tags: []}))}}});
        return;
      }
      await route.abort();
    });
    const page = await context.newPage();
    await page.goto(origem + '/incident_list.do');
    const mascote = page.getByRole('button', {name: 'Abrir Lino', exact: true});
    await mascote.waitFor();
    assert.equal(await page.locator('.janela-lino iframe').count(), 0);
    await page.screenshot({path: path.join(output, 'mascote-recolhido.png')});
    await mascote.press('Enter');
    const painel = page.frameLocator('iframe[title="Controles do Lino"]');
    const incidente = painel.getByRole('checkbox', {name: /DEMO001/});
    await incidente.check();
    await page.screenshot({path: path.join(output, 'mascote-flutuante.png')});
    await painel.getByRole('button', {name: 'Recolher Lino', exact: true}).click();
    assert.equal(await mascote.getAttribute('aria-expanded'), 'false');
    await mascote.click();
    assert(await incidente.isChecked());
    await painel.getByRole('button', {name: 'Grafo', exact: true}).click();
    await painel.getByRole('heading', {name: 'Grafo de tags'}).waitFor();
    liberarGrafo();
    await painel.getByRole('button', {name: 'Classificar e aplicar tags'}).click();
    await painel.getByText('Detalhes da classificação').waitFor();
    assert.deepEqual(aplicados, [id]);
    await painel.getByRole('button', {name: 'Recolher Lino', exact: true}).press('Escape');
    assert.equal(await mascote.getAttribute('aria-expanded'), 'false');
    assert.equal(context.pages().filter(tab => tab.url().startsWith(raiz + '/painel.html')).length, 0);
    // An iframe added by a page without the worker ticket cannot open the API workflow.
    await page.evaluate(url => {
      const frame = document.createElement('iframe');
      frame.id = 'sem-vinculo'; frame.src = url;
      document.body.append(frame);
    }, raiz + '/painel.html');
    await page.frameLocator('#sem-vinculo').getByRole('heading', {name: 'Abra o Lino pelo mascote'}).waitFor();
    console.log('MV3: mascote, abertura e recolhimento, grafo, classificação e vínculo da aba verificados.');
  } finally { liberarGrafo(); await context.close(); }
}

testar().catch(erro => { console.error(erro); process.exitCode = 1; }).finally(() => {
  const destino = path.resolve(pasta);
  if (path.dirname(destino) === path.resolve(os.tmpdir()) && path.basename(destino).startsWith('lino-mv3-')) {
    fs.rmSync(destino, {recursive: true, force: true, maxRetries: 3});
  }
});

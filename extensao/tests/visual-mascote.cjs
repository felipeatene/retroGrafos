const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const base = path.resolve(__dirname, '..'), output = path.resolve(base, '../output/mascote-preview');
fs.mkdirSync(output, {recursive: true});
const tipos = {'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.woff2':'font/woff2','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const server = http.createServer((req,res) => {
  const rota = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (rota.endsWith('.do')) { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<html><body style="font:16px Arial;margin:24px"><h1>Incidentes de demonstração</h1><table id="incident_table"><thead><tr><th>Número</th><th>Descrição</th></tr></thead><tbody><tr><td><a href="/incident.do?sys_id='+'a'.repeat(32)+'">DEMO001</a></td><td headers="short_description">Divergência de estoque</td></tr></tbody></table></body></html>'); return; }
  const raiz = rota.startsWith('/docs/mascote-referencia/') ? path.dirname(base) : base;
  const file = path.resolve(raiz, '.' + rota);
  if (!file.startsWith(raiz + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',tipos[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext(); const errors=[];
  await context.addInitScript(({origin})=>{
    const handlers=[]; globalThis.__mensagens=handlers;
    const data={}; const store={get:async k=>typeof k==='string'?{[k]:data[k]}:data,set:async d=>Object.assign(data,d),remove:async k=>delete data[k]};
    const listener={addListener:()=>{}};
    const aba={id:1,url:'https://dev217534.service-now.com/incident_list.do',status:'complete'};
    globalThis.chrome={runtime:{getURL:p=>origin+'/'+p,onMessage:{addListener:f=>handlers.push(f)},sendMessage:async m=>{
      if (m.tipo==='lino:estado') return {origem:origin,entrada:true,trabalho:false};
      if (m.tipo==='lino:preparar-janela') return {autorizacao:'fixture'};
      if (m.tipo==='lino:vincular-janela') return {id:1,origem:origin};
      return {entregue:false};
    },openOptionsPage:()=>{}},
      storage:{local:store,session:store,onChanged:listener}, permissions:{contains:async()=>true},tabs:{query:async()=>[aba],get:async()=>aba,onActivated:listener,onUpdated:listener,create:async()=>({id:2})},
      scripting:{executeScript:async o=>{
        if (o.world !== 'MAIN') return [{result:{tipo:'lista',registros:[{id:'a'.repeat(32),numero:'DEMO001',titulo:'Divergência de estoque'}]}}];
        const [,rota,opcoes]=o.args;
        let dados={itens:[],proximo:''};
        if (rota==='acesso') dados={usuario:'a'.repeat(32)};
        if (rota==='classificar') {
          globalThis.__classificados=opcoes.corpo.ids;
          dados={itens:opcoes.corpo.ids.map(id=>({id,numero:'DEMO001',estado:'analisado',tags:[]}))};
        }
        return [{result:{status:200,dados}}];
      }}};
  },{origin});
  for (const width of [260,380,900]) {
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width,height:850});
    await page.goto(origin+'/painel.html'); await page.getByRole('button',{name:'Classificar e aplicar tags',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`painel-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'panel overflow');
    const classificar=page.getByRole('button',{name:'Classificar e aplicar tags',exact:true});
    const grafo=page.getByRole('button',{name:'Grafo',exact:true});
    const chamado=page.getByRole('button',{name:'Chamado',exact:true});
    const incidente=page.getByRole('checkbox',{name:/DEMO001/});
    assert(await classificar.isDisabled());
    await incidente.check();
    await grafo.press('Enter');
    assert.equal(await grafo.getAttribute('aria-pressed'),'true');
    assert(await page.locator('#exploracao').isVisible());
    assert(await page.locator('#vista-chamado').isHidden());
    await page.screenshot({path:path.join(output,`grafo-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'graph overflow');
    await chamado.press('Enter');
    assert(await incidente.isChecked());
    await grafo.click();
    await classificar.click();
    await page.locator('#resultados').waitFor();
    assert(await page.locator('#vista-chamado').isVisible());
    assert.deepEqual(await page.evaluate(()=>globalThis.__classificados),['a'.repeat(32)]);
    await page.close();
  }
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width:1366,height:768});
  await page.goto(origin+'/incident_list.do'); await page.addScriptTag({url:origin+'/mascote.js'});
  await page.getByRole('button',{name:'Abrir Lino',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'pagina-contexto.png')});
  for (const tamanho of [48, 64, 88]) {
    await page.locator('#lino-assistente').evaluate((host, px) => host.style.setProperty('--lino-tamanho', px + 'px'), tamanho);
    const altura = await page.locator('#lino-assistente').evaluate(host => host.shadowRoot.querySelector('.personagem').getBoundingClientRect().height);
    assert(Math.abs(altura - tamanho) < 2, 'altura do pet ' + tamanho);
    await page.screenshot({path:path.join(output, `pet-${tamanho}.png`)});
  }
  await page.evaluate(()=>{ for(const f of __mensagens)f({tipo:'lino:etapa',etapa:'grafo',estado:'concluido',texto:'Uma tag ligada a um incidente.',miniGrafo:{tags:[{valor:'Estoque',conexoes:[0]}],incidentes:1}},{},()=>{}); });
  assert.equal(await page.locator('.mini-grafo line').count(),1);
  await page.evaluate(()=>{ for(const f of __mensagens)f({tipo:'lino:resultado',etapa:'resultado',estado:'erro',texto:'Uma tag precisa de atenção.',totais:{adicionada:8,existente:3,falha:1,negados:0,falhasDeRegistro:0},acao:{rotulo:'Ver detalhes',comando:'detalhes'}},{},()=>{}); });
  await page.screenshot({path:path.join(output,'pagina-resultado.png')});
  const opcoes=page.getByRole('button',{name:'Opções do mascote',exact:true});
  await opcoes.click();
  await page.getByRole('button',{name:'Minimizar',exact:true}).click();
  assert(await page.locator('#lino-assistente').evaluate(h=>h.shadowRoot.querySelector('.assistente').classList.contains('compacto')));
  await opcoes.click();
  await page.getByRole('button',{name:'Ocultar nesta página',exact:true}).click();
  assert(await page.locator('#lino-assistente').isHidden());
  await page.close();
  const rig=await context.newPage(); await rig.goto(origin+'/assets/mascote/demo.html'); await rig.screenshot({path:path.join(output,'rig.png'),fullPage:true});
  await rig.close(); await browser.close(); server.close();
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({errors,checks:['painel e grafo em 260, 380 e 900 px','navegação por teclado','seleção preservada ao alternar vistas','classificação pela barra','contexto e resultado','pet em 48, 64 e 88 px','minimizar e expandir','ocultar nesta página']},null,2));
  assert.deepEqual(errors,[]); console.log('Browser checks passed');
})().catch(e=>{console.error(e);server.close();process.exit(1)});

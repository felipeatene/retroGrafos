const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const base = path.resolve(__dirname, '..'), output = path.resolve(base, '../output/mascote-preview');
fs.mkdirSync(output, {recursive: true});
const tipos = {'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.woff2':'font/woff2','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const server = http.createServer((req,res) => {
  const rota = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (rota.endsWith('.do')) { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<html><body style="font:16px Arial;margin:24px"><h1>Incidentes de demonstração</h1><table id="incident_table"><thead><tr><th>Número</th><th>Descrição</th></tr></thead><tbody><tr><td><a href="/incident.do?sys_id='+'a'.repeat(32)+'">DEMO001</a></td><td headers="short_description">Divergência de estoque</td></tr></tbody></table></body></html>'); return; }
  const file=path.join(base,rota); if (!file.startsWith(base) || !fs.existsSync(file)) {res.statusCode=404;res.end();return;}
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
    globalThis.chrome={runtime:{getURL:p=>origin+'/'+p,onMessage:{addListener:f=>handlers.push(f)},sendMessage:async m=>m.tipo==='lino:estado'?{origem:origin,entrada:true,trabalho:false}:{entregue:false},openOptionsPage:()=>{}},
      storage:{local:store,session:store,onChanged:listener}, permissions:{contains:async()=>true},tabs:{query:async()=>[{id:1,url:'https://dev217534.service-now.com/incident_list.do',status:'complete'}],onActivated:listener,onUpdated:listener,create:async()=>({id:2})},
      scripting:{executeScript:async o=>o.world==='MAIN'?[{result:{status:200,dados:o.args[1]==='acesso'?{usuario:'a'.repeat(32)}:{itens:[],proximo:''}}}]:[{result:{tipo:'lista',registros:[{id:'a'.repeat(32),numero:'DEMO001',titulo:'Divergência de estoque'}]}}]}};
  },{origin});
  for (const width of [380,900]) {
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width,height:850});
    await page.goto(origin+'/painel.html'); await page.getByRole('button',{name:'Classificar e aplicar tags',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`painel-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'panel overflow');
    await page.close();
  }
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width:1366,height:768});
  await page.goto(origin+'/incident_list.do'); await page.addScriptTag({url:origin+'/mascote.js'});
  await page.getByRole('button',{name:'Lino, assistente do RetroGrafos. Abrir mensagens',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'pagina-contexto.png')});
  await page.evaluate(()=>{ for(const f of __mensagens)f({tipo:'lino:resultado',etapa:'resultado',estado:'erro',texto:'Uma tag precisa de atenção.',totais:{adicionada:8,existente:3,falha:1,negados:0,falhasDeRegistro:0},acao:{rotulo:'Ver detalhes',comando:'detalhes'}},{},()=>{}); });
  await page.screenshot({path:path.join(output,'pagina-resultado.png')});
  await page.getByRole('button',{name:'Minimizar',exact:true}).click();
  assert(await page.locator('#lino-assistente').evaluate(h=>h.shadowRoot.querySelector('.assistente').classList.contains('compacto')));
  await page.getByRole('button',{name:'Lino, assistente do RetroGrafos. Abrir mensagens',exact:true}).click();
  await page.getByRole('button',{name:'Ocultar nesta página',exact:true}).click();
  assert(await page.locator('#lino-assistente').isHidden());
  await page.close();
  const rig=await context.newPage(); await rig.goto(origin+'/assets/mascote/demo.html'); await rig.screenshot({path:path.join(output,'rig.png'),fullPage:true});
  await rig.close(); await browser.close(); server.close();
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({errors,checks:['painel 380 e 900 sem overflow','contexto e resultado','minimizar e expandir','ocultar nesta página']},null,2));
  assert.deepEqual(errors,[]); console.log('Browser checks passed');
})().catch(e=>{console.error(e);server.close();process.exit(1)});

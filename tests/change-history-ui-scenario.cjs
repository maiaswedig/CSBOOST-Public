const fs=require('node:fs/promises');
module.exports=async function({js,click,waitFor,fixture}){
  await click('Desempenho');await waitFor(()=>js("[...document.querySelectorAll('[role=tab]')].some(tab=>tab.textContent.includes('Histórico'))"),'change history tab');
  await click('Histórico');await waitFor(()=>js("!!document.querySelector('.change-history-entry')"),'change history rows');
  const rows=await js("[...document.querySelectorAll('.change-history-entry')].map(row=>row.textContent)");
  if(!rows.some(row=>row.includes('MSAA QA Sanitização')&&row.includes('Restaurado')))throw Error('History panel did not show the adjustment and its confirmed restoration state: '+JSON.stringify(rows));
  if(await js("document.querySelector('.change-history-panel')?.textContent.includes('76561198000000000')"))throw Error('Steam account ID leaked into the history UI');
  await click('Exportar histórico JSON');await waitFor(()=>fs.stat(require('node:path').join(fixture,'history-export.json')).then(()=>true,()=>false),'change history export');
  const exported=JSON.parse(await fs.readFile(require('node:path').join(fixture,'history-export.json'),'utf8'));
  if(exported.personalDataIncluded!==false||!Array.isArray(exported.events)||JSON.stringify(exported).includes('76561198000000000')||JSON.stringify(exported).includes('boost:'))throw Error('Exported history contains account identity or ownership tokens');
  if(!exported.events.some(event=>event.module==='Boost Máximo · Gráficos'&&event.label==='MSAA QA Sanitização'&&event.previous==='4'&&event.applied==='0'&&event.restoration==='restored'))throw Error('Exported history omitted the adjustment values or restoration state');
  return ['change history is visible in Performance without account identifiers','JSON history export includes before/after, reason, confirmed restoration and no Steam ID or owner token'];
};

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO='https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents';
const RAW='https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/main';
export function parseStandings(markdown){
  const asOf=markdown.match(/Standings as of (\d{4})_(\d{2})_(\d{2})/)?.slice(1).join('-');
  const teams=[];
  for(const line of markdown.split(/\r?\n/)){
    const cells=line.split('|').slice(1,-1).map(x=>x.trim());
    if(cells.length<4||!/^\d+$/.test(cells[0])||!/^\d+$/.test(cells[1]))continue;
    const name=cells[2].replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
    teams.push({rank:Number(cells[0]),points:Number(cells[1]),name,roster:cells[3].split(',').map(x=>x.trim()).filter(Boolean)});
  }
  if(!asOf||!teams.length)throw new Error('O ranking publicado mudou de formato.');
  return {asOf,teams};
}
export function plainNewsText(value){
  return String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'')
    .replace(/\[\/?(?:p|list|olist|h[1-6])\]/gi,'\n').replace(/\[\/\*\]/g,'\n').replace(/\[\*\]/g,'\n• ')
    .replace(/\[\/?(?:b|i|u|s|quote|code|url|img|table|tr|td)(?:=[^\]]*)?\]/gi,'')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);/gi,"'")
    .replace(/\\(?=\[)/g,'').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n•\n+/g,'\n• ').replace(/\n{3,}/g,'\n\n').trim().slice(0,1200);
}
const plainText=value=>plainNewsText(value).replace(/\s+/g,' ');
const articleHosts=new Set(['steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net','github.com']);
function articleUrl(value){try{const url=new URL(value);return typeof value==='string'&&value.length<=2048&&url.protocol==='https:'&&articleHosts.has(url.hostname)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function validCache(value,name,now){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.loadedAt!=='string'||!Number.isFinite(Date.parse(value.loadedAt))||Date.parse(value.loadedAt)>now+300000)return false;
  const text=(value,max)=>typeof value==='string'&&value.length<=max;
  if(name==='news')return value.formatVersion===2&&value.source==='Steam / Valve'&&Array.isArray(value.items)&&value.items.length<=100&&value.items.every(item=>item&&text(item.id,100)&&text(item.title,1200)&&text(item.summary,1200)&&text(item.author,1200)&&typeof item.date==='string'&&Number.isFinite(Date.parse(item.date))&&articleUrl(item.url));
  return typeof value.asOf==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)&&Number.isFinite(Date.parse(value.asOf))&&typeof value.source==='string'&&value.source.startsWith('https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/live/')&&Array.isArray(value.teams)&&value.teams.length>0&&value.teams.length<=2000&&value.teams.every(team=>team&&Number.isFinite(team.rank)&&team.rank>0&&Number.isFinite(team.points)&&team.points>=0&&text(team.name,300)&&Array.isArray(team.roster)&&team.roster.length<=30&&team.roster.every(player=>text(player,300)));
}
export function createContent({directory,openExternal,fetchImpl=fetch,now=()=>Date.now()}){
  const inflight=new Map();
  async function request(url,json=true){const response=await fetchImpl(url,{headers:{Accept:json?'application/json':'text/plain','User-Agent':'CSBOOST-Free/1.0.0'},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw new Error(`Fonte pública indisponível (HTTP ${response.status}).`);if(Number(response.headers.get('content-length'))>5*1024*1024)throw new Error('Resposta pública grande demais.');const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024)throw new Error('Resposta pública grande demais.');chunks.push(value);}}finally{reader.releaseLock();}const text=Buffer.concat(chunks).toString('utf8');return json?JSON.parse(text):text;}
  async function cached(name,ttl,producer){
    if(inflight.has(name))return inflight.get(name);
    const job=(async()=>{
      const file=path.join(directory,name+'.json');let cache=null;
      try{const parent=await fs.lstat(directory),stat=await fs.lstat(file);if(parent.isDirectory()&&!parent.isSymbolicLink()&&stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=5*1024*1024){const saved=JSON.parse(await fs.readFile(file,'utf8'));if(validCache(saved,name,now()))cache=saved;}}catch{}
      if(cache&&now()-Date.parse(cache.loadedAt)<ttl)return {...cache,offline:false};
      let result;try{result={...await producer(),loadedAt:new Date(now()).toISOString(),offline:false};if(!validCache(result,name,now()))throw Error('A fonte pública retornou conteúdo incompatível.');}catch(error){if(cache)return {...cache,offline:true,refreshError:error.message};throw error;}
      const tmp=file+'.'+crypto.randomUUID()+'.tmp';
      try{await fs.mkdir(directory,{recursive:true});const parent=await fs.lstat(directory);if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('Pasta de cache inválida.');try{const target=await fs.lstat(file);if(!target.isFile()||target.isSymbolicLink())throw Error('Arquivo de cache inválido.');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.writeFile(tmp,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}catch{await fs.unlink(tmp).catch(()=>{});return {...result,cacheWarning:'A consulta atual está disponível, mas não foi possível guardar uma cópia para uso sem conexão.'};}
      return result;
    })();inflight.set(name,job);try{return await job;}finally{inflight.delete(name);}
  }
  async function getNews(){return cached('news',15*60*1000,async()=>{const data=await request('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=20&maxlength=0&feeds=steam_community_announcements&format=json');if(!Array.isArray(data.appnews?.newsitems)||data.appnews.newsitems.length>100)throw new Error('A Steam não retornou notícias válidas.');const items=[];for(const x of data.appnews.newsitems){if(!x||typeof x!=='object'||!Number.isFinite(x.date)||!articleUrl(x.url)||!String(x.gid??'').trim()||String(x.gid).length>100)continue;const date=new Date(x.date*1000);if(!Number.isFinite(date.getTime()))continue;items.push({id:String(x.gid),title:plainText(x.title),summary:plainNewsText(x.contents),date:date.toISOString(),url:articleUrl(x.url),author:plainText(x.author||'Valve')});}if(data.appnews.newsitems.length&&!items.length)throw Error('A Steam não retornou notícias válidas.');return {formatVersion:2,source:'Steam / Valve',items};});}
  async function getRankings(){return cached('rankings',6*60*60*1000,async()=>{let entries,year=new Date(now()).getUTCFullYear();for(let attempt=0;attempt<2;attempt++,year--){try{entries=await request(`${REPO}/live/${year}`);if(Array.isArray(entries)&&entries.some(x=>/^standings_global_\d{4}_\d{2}_\d{2}\.md$/.test(x.name)))break;}catch(error){if(attempt===1)throw error;}}if(!Array.isArray(entries))throw new Error('Lista de rankings indisponível.');const latest=entries.filter(x=>/^standings_global_\d{4}_\d{2}_\d{2}\.md$/.test(x.name)).sort((a,b)=>b.name.localeCompare(a.name))[0];if(!latest)throw new Error('Nenhum ranking global publicado.');const markdown=await request(`${RAW}/live/${year}/${latest.name}`,false);return {...parseStandings(markdown),source:`https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/live/${year}/${latest.name}`};});}
  async function openArticle(value){if(typeof value!=='string')throw new Error('Link inválido.');const url=new URL(value);const allowed=new Set(['steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net','github.com']);if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.username||url.password)throw new Error('Link fora das fontes permitidas.');await openExternal(url.href);return {opened:true};}
  return {getNews,getRankings,openArticle};
}

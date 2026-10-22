// Public HTML facts and image references only. Scripts and private APIs are never loaded.
export const PRO_ORIGIN='https://prosettings.net';
export const PRO_LIST=PRO_ORIGIN+'/lists/cs2/';
export const PRO_TEAMS=PRO_ORIGIN+'/teams/';
export const PRO_GROUPS=Object.freeze({mouse:'Mouse e sensibilidade',crosshair:'Mira',viewmodel:'Posição da arma',video:'Vídeo',hud:'HUD',radar:'Radar'});
const MAX=2*1024*1024;
export function proId(value){if(typeof value!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value))throw Error('Use o identificador da página do jogador, como donk, m0nesy ou fallen.');return value;}
export const proUrl=id=>PRO_ORIGIN+'/players/'+proId(id)+'/';
export function publicText(value){return String(value??'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_m,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_m,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]).replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);}
function html(value){if(typeof value!=='string'||Buffer.byteLength(value)>MAX)throw Error('Publicação fora do limite de leitura.');return value.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');}
const numeric=value=>/^\d+(?:\.\d+)?$/.test(value)?Number(value):null;
export function publicImageUrl(value){
  if(typeof value!=='string'||value.length>600)return null;
  return /^https:\/\/prosettings\.net\/wp-content\/uploads\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(value)?value:null;
}
export function publicLogoUrl(value){return publicImageUrl(value)||(typeof value==='string'&&value.length<=600&&/^https:\/\/prosettings\.net\/wp-content\/uploads\/[a-zA-Z0-9/_-]+\.svg$/.test(value)?value:null);}
function imageIn(fragment,logo=false){return (logo?publicLogoUrl:publicImageUrl)(fragment?.match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1]);}
function teamIn(fragment){return fragment?.match(/href=["']https:\/\/prosettings\.net\/teams\/([a-z0-9-]+)\/["']/i)?.[1]||null;}
export function teamKey(name){return String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^team\s+/,'').replace(/\s+(?:esports|clan|gaming|team)$/,'').replace(/[^a-z0-9]/g,'');}
export function playerKey(name){return String(name||'').normalize('NFC').trim().toLowerCase();}
// Confirmed against the dated Valve roster and the publisher's canonical page:
// https://prosettings.net/players/hunter/ (Nemanja Kovač, published as huNter).
// Do not derive aliases by stripping punctuation from arbitrary nicknames.
export function publicPlayerAliases(id,name){return id==='hunter'&&playerKey(name)==='hunter'?['huNter-']:[];}
export function findPublicPlayer(players,name){const key=playerKey(name),matches=players.filter(player=>playerKey(player.name)===key||publicPlayerAliases(player.id,player.name).some(alias=>playerKey(alias)===key));return matches.length===1?matches[0]:null;}
export function parseProTeams(input){
  const source=html(input),teams=[],ids=new Set();
  for(const match of source.matchAll(/<div\b[^>]*class=["'][^"']*\bjs-team-card\b[^"']*["'][^>]*data-games=["']([^"']*)["'][^>]*data-name=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bjs-team-card\b|<\/section>)/gi)){
    if(!match[1].split(',').includes('468'))continue;
    const id=teamIn(match[3]),name=publicText(match[2]),logo=imageIn(match[3],true);
    if(id&&name&&logo&&!ids.has(id)){proId(id);teams.push({id,name,logo});ids.add(id);}
    if(teams.length>1000)throw Error('Lista pública de times grande demais.');
  }
  if(!teams.length)throw Error('Lista pública de times mudou de formato.');return teams;
}
export function parseProCatalog(input){
  const source=html(input),table=source.match(/<table\b[^>]*\bid=["']pro-list-table["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];if(!table)throw Error('A lista pública mudou de formato.');
  const headers=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>publicText(m[1]));if(headers[1]!=='Team'||headers[2]!=='Player'||!headers.includes('DPI')||!headers.includes('Sens'))throw Error('Colunas da lista pública não reconhecidas.');
  const players=[],ids=new Set();for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(!cells.length)continue;
    const link=cells[2]?.match(/<a\b[^>]*href=["']https:\/\/prosettings\.net\/players\/([a-z0-9-]+)\/["'][^>]*>([\s\S]*?)<\/a>/i);if(!link)continue;
    const id=proId(link[1]),name=publicText(link[2]);if(!name||ids.has(id))throw Error('Jogador repetido ou sem nome na publicação.');ids.add(id);
    const cell=key=>publicText(cells[headers.indexOf(key)]||'');const dpi=numeric(cell('DPI')),sensitivity=numeric(cell('Sens'));
    players.push({id,name,team:publicText(cells[1])||'Sem time publicado',teamId:teamIn(cells[1]),teamLogo:imageIn(cells[1],true),role:cell('Role'),dpi:dpi>0&&dpi<=100000?dpi:null,sensitivity:sensitivity>0&&sensitivity<=100?sensitivity:null,edpi:dpi>0&&sensitivity>0?Math.round(dpi*sensitivity*1000)/1000:null,resolution:cell('Resolution')||null});
    if(players.length>1500)throw Error('Lista pública excede o limite de jogadores.');
  }
  if(!players.length)throw Error('A fonte não publicou jogadores reconhecíveis.');return players;
}
export function parseProPlayer(input,id){
  id=proId(id);const source=html(input),canonical=source.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];if(canonical!==proUrl(id))throw Error('A publicação não corresponde ao jogador solicitado.');
  const name=publicText(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);const start=source.indexOf('id="cs2-settings"'),end=source.indexOf('id="cs2_config"',start);if(!name||start<0)throw Error('Configurações de CS2 não publicadas para este identificador.');
  const game=source.slice(start,end>start?end:source.indexOf('id="cs2_cosmetics"',start)>start?source.indexOf('id="cs2_cosmetics"',start):start+100000),fields={};
  for(const match of game.matchAll(/<tr\b[^>]*\bdata-field=["']([a-z0-9_-]+)["'][^>]*>[\s\S]*?<th\b[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)){if(Object.keys(fields).length>=150)throw Error('Publicação contém campos demais.');if(!Object.hasOwn(fields,match[1]))fields[match[1]]=publicText(match[3])||null;}
  if(!Object.keys(fields).length)throw Error('A publicação mudou de formato; nenhum campo foi importado.');
  const bio=source.slice(source.indexOf('<h1'),start),team=publicText(bio.match(/<tr\b[^>]*class=["'][^"']*\bfield-team\b[^"']*["'][^>]*>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1])||'Sem time publicado';
  const rawDate=bio.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],updatedAt=rawDate&&Number.isFinite(Date.parse(rawDate))?new Date(rawDate).toISOString():null;
  const avatar=bio.match(/<section\b[^>]*class=["']avatar["'][^>]*>([\s\S]*?)<\/section>/i)?.[1];
  const teamRow=bio.match(/<tr\b[^>]*class=["'][^"']*\bfield-team\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/i)?.[1];
  return {id,name,team,updatedAt,fields,portrait:imageIn(avatar),teamId:teamIn(teamRow),teamLogo:imageIn(teamRow,true)};
}
export async function fetchProHtml(url,fetchImpl=fetch){
  if(url!==PRO_LIST&&url!==PRO_TEAMS&&!/^https:\/\/prosettings\.net\/players\/[a-z0-9-]+\/$/.test(url))throw Error('Fonte fora do catálogo permitido.');
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html','User-Agent':'CSBOOST-Free/1.10.0'}});if(!response.ok)throw Error(`Publicação indisponível (HTTP ${response.status}).`);
  if(Number(response.headers.get('content-length'))>MAX||!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Resposta da publicação não é HTML compatível.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX){await reader.cancel();throw Error('Publicação maior que o limite de leitura.');}chunks.push(value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');
}

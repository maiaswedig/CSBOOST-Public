import fs from 'node:fs/promises';
import path from 'node:path';

// Release policy is source controlled. Renderer preferences and environment
// variables cannot grant rights to third-party content.
export const PUBLICATION_POLICY=Object.freeze({proSettings:false,publicMedia:false,rankings:false,news:false});
export const PUBLICATION_LINKS=Object.freeze({proSettings:'https://prosettings.net/cs2/',rankings:'https://github.com/ValveSoftware/counter-strike_regional_standings',news:'https://store.steampowered.com/news/app/730'});
export function createPublicationServices({directory,openExternal}){
  const blocked=async()=>{throw Error('Conteúdo externo indisponível nesta edição. Consulte a fonte oficial no navegador.');};
  const proLibrary=Object.fromEntries(['catalog','player','media','preview','confirmPreview','importConfig','copyIntoProfile','openSource'].map(name=>[name,blocked]));
  const openSource=async key=>{
    if(typeof key!=='string'||!Object.hasOwn(PUBLICATION_LINKS,key))throw Error('Fonte oficial inválida.');
    await openExternal(PUBLICATION_LINKS[key]);return {opened:true};
  };
  const content={getNews:blocked,getRankings:blocked,openArticle:async value=>{
    const key=Object.keys(PUBLICATION_LINKS).find(key=>PUBLICATION_LINKS[key]===value);
    if(!key)throw Error('Link fora das fontes oficiais permitidas.');return openSource(key);
  }};
  async function clearCache(){
    let removed=0;
    const parent=await fs.lstat(directory);if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('Pasta de dados inválida.');
    for(const [folder,pattern]of [['content',/^(news|rankings)\.json$/],['pro-library',/^(catalog|teams|player-[a-z0-9-]+)\.json$/],['pro-media',/^[a-f0-9]{64}\.json$/]]){
      const target=path.join(directory,folder);let stat;
      try{stat=await fs.lstat(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Pasta de cache redirecionada; limpeza recusada.');
      for(const name of await fs.readdir(target))if(pattern.test(name)){
        const file=path.join(target,name),entry=await fs.lstat(file);
        if(!entry.isFile()||entry.isSymbolicLink())continue;
        await fs.unlink(file);removed++;
      }
    }
    return {removed};
  }
  return {content,proLibrary,proMedia:{get:async()=>({available:false,disabled:true})},openSource,clearCache};
}

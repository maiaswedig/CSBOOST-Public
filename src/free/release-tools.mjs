import fs from 'node:fs/promises';
import path from 'node:path';

export function createReleaseTools({shell,desktop,executable,readme,notices,privacy}){
  return {
    async createShortcut(){
      if(!path.isAbsolute(desktop)||!path.isAbsolute(executable)||path.basename(executable).toLowerCase()!=='csboost.exe')throw Error('Caminho do aplicativo inválido.');
      const target=path.join(desktop,'CSBOOST.lnk');
      try{const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('O atalho existente não pode ser substituído.');const previous=shell.readShortcutLink(target);if(path.basename(previous.target).toLowerCase()!=='csboost.exe')throw Error('Já existe um atalho com esse nome para outro aplicativo.');}catch(error){if(error.code!=='ENOENT')throw error;}
      if(!shell.writeShortcutLink(target,'create',{target:executable,cwd:path.dirname(executable),description:'CSBOOST — configurações e desempenho para CS2',appUserModelId:'app.csboost.free',icon:executable,iconIndex:0}))throw Error('O Windows não confirmou a criação do atalho.');
      if(path.resolve(shell.readShortcutLink(target).target).toLowerCase()!==path.resolve(executable).toLowerCase())throw Error('O atalho criado não aponta para esta versão.');
      return {created:true,path:target};
    },
    async openGuide(){const result=await shell.openPath(readme);if(result)throw Error('Não foi possível abrir o guia.');return {opened:true};},
    async openNotices(){const result=await shell.openPath(notices);if(result)throw Error('Não foi possível abrir os créditos.');return {opened:true};},
    async openPrivacy(){if(typeof privacy!=='string'||!path.isAbsolute(privacy))throw Error('Aviso de privacidade indisponível nesta execução.');const result=await shell.openPath(privacy);if(result)throw Error('Não foi possível abrir o aviso de privacidade.');return {opened:true};},
    async openHardwareHelp({vendor}={}){
      const links={Intel:'https://www.intel.com/content/www/us/en/support/articles/000006636.html',AMD:'https://www.amd.com/en/products/software/ryzen-master.html'};
      if(!Object.hasOwn(links,vendor))throw Error('Fabricante não reconhecido.');await shell.openExternal(links[vendor]);return {opened:true};
    }
  };
}

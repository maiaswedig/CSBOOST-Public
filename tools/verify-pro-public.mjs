// Live public HTML only; no personal profile/session/game/driver changes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProLibrary} from '../src/free/pro-library.mjs';
import {createProfiles,renderConfig} from '../src/free/profiles.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-public-pro-'));
try{
  const library=createProLibrary({directory:path.join(root,'cache'),profiles:createProfiles(path.join(root,'profiles'))});
  const catalog=await library.catalog();
  const players=[];
  for(const id of ['donk','m0nesy','fallen']){
    const player=await library.player({id});
    const sections=player.sections.filter(s=>['mouse','crosshair','viewmodel','video'].includes(s.id)&&s.fields.some(f=>f.copyable)).map(s=>s.id);
    const preview=await library.preview({id,sections});
    renderConfig({settings:preview.settings}); // Existing profile renderer must also accept the resulting values.
    players.push({id,name:player.name,team:player.team,source:player.source,sections:player.sections.map(s=>({id:s.id,published:s.fields.filter(f=>f.value!==null).length,copyable:s.fields.filter(f=>f.copyable).length})),preview:{sections,sensitivity:preview.settings.sensitivity,crosshairVersion:preview.settings.crosshair.version,style:preview.settings.crosshair.style,changes:preview.changes.length,advancedFields:Object.keys(preview.settings.graphics??{}).length,validConfig:true}});
  }
  const report={ok:true,checkedAt:new Date().toISOString(),mode:'read-only',catalog:{players:catalog.players.length,source:catalog.url,scope:catalog.scope},players,userFilesModified:false,hardwareSettingsModified:false,gameLaunched:false,profileImported:false,fpsGainMeasured:false,originalServicesUsed:false};
  await fs.writeFile(path.resolve('analysis/free-verification/pro-public-preview.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await fs.rm(root,{recursive:true,force:true});}

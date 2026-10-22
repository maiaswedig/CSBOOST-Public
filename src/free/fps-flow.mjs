import {stateHash} from './owned-state.mjs';
const PRESETS=['balanced','performance','competitive'];
const videoPreset=preset=>preset==='competitive'?'competitive':'fps';
export function createFpsFlow({benchmarkSetup,boostPlan,getSteamId,isGameRunning,sessions,resumeOnLogin}){
  async function stopped(){if(await isGameRunning()||await sessions.getState())throw Error('Feche o CS2 e encerre a sessão antes de configurar o FPS+.');}
  async function study(id){const current=await benchmarkSetup.getState();if(!current?.guided||![1,3].includes(current.targetRuns)||id!==current.id||!PRESETS.includes(current.preset))throw Error('O estudo FPS+ mudou. Atualize a tela.');return current;}
  async function ready(id){const current=await study(id);if(current.status!=='active'||current.baselineIds.length!==current.targetRuns||current.optimizedIds.length||current.pendingRun)throw Error('Conclua a medição Antes e aguarde a restauração.');return current;}
  async function getState(){const [current,boost,session]=await Promise.all([benchmarkSetup.getState(),boostPlan.inspect(),sessions.getState()]);return {study:current?.guided?current:null,legacyStudyActive:!!current&&!current.guided&&current.status==='active',boost,session,resume:resumeOnLogin?.status()??{available:false,armed:false}};}
  async function create({preset='performance'}={}){if(!PRESETS.includes(preset))throw Error('Perfil FPS+ inválido.');await stopped();if((await boostPlan.inspect()).pendingRestore)throw Error('Restaure o Boost anterior antes de criar uma referência Antes.');await benchmarkSetup.create({preset,targetRuns:1,optimizedMode:'boosted',guided:true});return getState();}
  async function preview({studyId,selection,automatic=selection===undefined}={}){await stopped();const current=await ready(studyId);if(current.adjustments.confirmed)throw Error('Os ajustes deste estudo já foram registrados.');
    const options={preset:videoPreset(current.preset),resolution:'keep',keepPowerPlan:true,...(automatic?{automatic:true}:selection===undefined?{}:{selection})};
    if(current.preset==='balanced'){options.selection=(selection??(await boostPlan.preview(options)).selectedIds).filter(id=>id!=='video');delete options.automatic;}
    const plan=await boostPlan.preview(options);if(current.preset==='balanced')plan.items=plan.items.map(item=>item.id==='video'?{...item,selectable:false,selected:false,reason:'Equilibrado preserva as configurações de vídeo atuais.'}:item);return {...plan,studyId:current.id,profile:current.preset};
  }
  async function record({studyId,rebootRequired=false,autoResume=false}={}){if(typeof autoResume!=='boolean'||autoResume&&(!rebootRequired||!resumeOnLogin?.status().available))throw Error('A abertura automática exige reinício selecionado e suporte do Windows.');await stopped();const current=await ready(studyId),boost=await boostPlan.inspect(),steamId=await getSteamId();
    if(boost.status!=='active'||boost.ownerKey!==stateHash(['boost',steamId])||!boost.ownerToken||!boost.selectedIds?.length)throw Error('Não há Boost ativo desta conta para vincular ao estudo.');
    if(boost.selectedIds.includes('video')&&(current.preset==='balanced'||boost.videoPreset!==videoPreset(current.preset)))throw Error('O vídeo do Boost ativo não corresponde ao perfil escolhido.');
    if(boost.selectedIds.includes('power'))throw Error('Este Boost alterou o plano de energia. Restaure-o e crie outra referência FPS+ para preservar o mesmo plano nos dois testes.');
    await benchmarkSetup.recordBoost({studyId,rebootRequired,receipt:{ownerToken:boost.ownerToken,ownerKey:boost.ownerKey,selectedIds:[...boost.selectedIds],videoPreset:boost.videoPreset}});if(autoResume)resumeOnLogin.arm();return getState();
  }
  async function apply(request){if(!request||typeof request.rebootRequired!=='boolean')throw Error('Confirme a opção de reinício.');if(request.autoResume!==undefined&&typeof request.autoResume!=='boolean'||request.autoResume&&(!request.rebootRequired||!resumeOnLogin?.status().available))throw Error('A abertura automática exige reinício selecionado e suporte do Windows.');const plan=await preview({studyId:request.studyId,...(request.automatic?{automatic:true}:{selection:request.selectedIds,automatic:false})});if(plan.previewFingerprint!==request.previewFingerprint||plan.selectedIds.length!==request.selectedIds?.length)throw Error('A prévia do FPS+ mudou; confira os boosters novamente.');
    await boostPlan.apply({previewFingerprint:plan.previewFingerprint,selectedIds:plan.selectedIds,preset:plan.preset,resolution:'keep',automatic:plan.automatic,keepPowerPlan:true});
    // If this metadata write fails, the durable Boost journal remains authoritative.
    // The UI offers record() to attach that verified active receipt without reapply.
    return record({studyId:request.studyId,rebootRequired:request.rebootRequired,autoResume:request.autoResume??false});
  }
  return {getState,create,preview,apply,record,cancelAutoResume:()=>resumeOnLogin?.cancel()};
}

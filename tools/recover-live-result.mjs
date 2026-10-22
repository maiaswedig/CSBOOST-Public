// Recover a real report after a collector interruption. Do not infer focus or FPS.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),data=path.join(process.env.APPDATA,'csboost-free'),live=path.join(data,'live-benchmark');
const load=name=>import(pathToFileURL(path.join(root,'src','free',name)).href);
const [{createBenchmarkProtocol},{createBenchmarks},{createBenchmarkContext},{createSystem},{createAmdTuning}]=await Promise.all(['benchmark-runner.mjs','benchmarks.mjs','benchmark-context.mjs','system.mjs','amd-tuning.mjs'].map(load));
const run=JSON.parse(await fs.readFile(path.join(live,'benchmark-runs','active-benchmark.json'),'utf8'));
if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(run.id)||!run.observedGame||run.type!=='baseline'||!Number.isSafeInteger(run.logCapture?.initialOffset))throw Error('Registro de execução inválido.');
const system=createSystem({dataDirectory:live}),game=await system.refreshSteam();
const logPath=path.join(game.gamePath,'game','csgo','console.log');
if(path.normalize(logPath).toLowerCase()!==path.normalize(run.logPath).toLowerCase())throw Error('A instalação mudou.');
const bytes=await fs.readFile(logPath),fresh=bytes.subarray(run.logCapture.initialOffset),protocol=createBenchmarkProtocol();
let accepted=null,offset=0;
for(const line of fresh.toString('utf8').split(/(?<=\n)/)){protocol.consume(line.replace(/[\r\n]+$/,''));offset+=Buffer.byteLength(line);const observation=protocol.snapshot();if(observation.status==='invalid')throw Error(observation.reason);if(observation.status==='valid'){accepted=observation.result;break;}}
if(!accepted)throw Error('O novo log ainda não contém um relatório completo e validado do mapa.');
const capture=path.join(live,'benchmark-runs',run.id+'-recovered.log');
await fs.writeFile(capture,fresh.subarray(0,offset),{flag:'wx',mode:0o600});
const context=await createBenchmarkContext({directory:path.join(live,'benchmark-context'),system,amdTuning:createAmdTuning()}).complete(run.id);
context.warnings.push('Resultado recuperado após interrupção do coletor. O foco contínuo do jogo não foi validado; repita a medição para uma referência mais confiável.');
context.collectorInterrupted=true;context.continuousFocusVerified=false;
const result=await createBenchmarks(path.join(data,'benchmarks')).importFile(capture,{context});
const report={realExecution:true,collectorInterrupted:true,continuousFocusVerified:false,result,protocol:accepted,fpsLimitRestorationPending:true};
await fs.writeFile(path.join(root,'analysis','free-verification','baseline-recovered.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({saved:true,averageFps:result.averageFps,onePercentLow:result.onePercentLow,durationSeconds:accepted.durationSeconds,collectorInterrupted:true,continuousFocusVerified:false}));

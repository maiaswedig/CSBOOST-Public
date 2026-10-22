import path from 'node:path';
import {spawn} from 'node:child_process';

const OPS=new Set(['snapshot','list','sample','getPower','setPower','getMemoryPriority','setMemoryPriority','setPriority','topology','getAffinity','setAffinity','focused','steamActiveUser']);
const MAX_LINE=512*1024;
export function createWatcher({workerPath,spawnImpl=spawn,timeoutMs=15000}={}){
  let child=null,ready=null,failed=null,buffer='',pending=null,sequence=0,queued=0,tail=Promise.resolve(),target=null,cancelStart=null,epoch=0,stopping=false;
  function abort(error){failed??=error;pending?.reject(failed);pending=null;try{child?.kill();}catch{}}
  function start({gamePath,executablePath}={}){
    if(stopping)return Promise.reject(new Error('Aguarde o encerramento do monitor antes de reiniciá-lo.'));
    const selected=executablePath||(gamePath?path.join(gamePath,'game','bin','win64','cs2.exe'):null);
    if(selected&&(!path.isAbsolute(selected)||path.basename(selected).toLowerCase()!=='cs2.exe'))return Promise.reject(new Error('Caminho do CS2 inválido.'));
    if(child){if(selected!==target)return Promise.reject(new Error('Encerre o monitor antes de trocar o jogo.'));return failed?Promise.reject(failed):ready;}
    if(failed)return Promise.reject(failed);
    if(typeof workerPath!=='string'||!path.isAbsolute(workerPath))return Promise.reject(new Error('Worker de monitoramento inválido.'));
    target=selected;buffer='';const instance=++epoch;
    ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{const error=new Error('O monitor não iniciou no prazo.');reject(error);abort(error);},timeoutMs);
      cancelStart=()=>{clearTimeout(timer);reject(new Error('Monitor encerrado durante a inicialização.'));};
      let initialized=false;
      const fail=error=>{if(instance!==epoch)return;clearTimeout(timer);reject(error);abort(error);};
      try{child=spawnImpl(workerPath,selected?['--game',selected]:[],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}catch(error){fail(error);return;}
      child.on('error',fail);child.on('exit',()=>fail(new Error('O monitor de processos foi encerrado.')));
      child.stdin.on('error',fail);child.stdout.on('error',fail);child.stderr?.on('error',fail);
      let stderrBytes=0;child.stderr?.on('data',data=>{stderrBytes+=data.length;if(stderrBytes>MAX_LINE)fail(new Error('Saída de erro do monitor excedeu o limite.'));});
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
        buffer+=chunk;if(buffer.length>MAX_LINE){fail(new Error('Resposta do monitor excedeu o limite.'));return;}
        let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;
          let message;try{message=JSON.parse(line);}catch{fail(new Error('Resposta inválida do monitor.'));return;}
          if(!initialized){if(message.ready!==true||message.version!==1){fail(new Error('Protocolo do monitor incompatível.'));return;}initialized=true;clearTimeout(timer);resolve();continue;}
          if(!pending||message.id!==pending.id||typeof message.ok!=='boolean'){fail(new Error('Resposta fora da sequência do monitor.'));return;}
          const current=pending;pending=null;message.ok?current.resolve(message.result):current.reject(new Error(typeof message.error==='string'?message.error:'Falha no monitor.'));
        }
      });
    });
    return ready;
  }
  function request(input){
    const message=typeof input==='string'?{op:input}:input;
    if(!message||!OPS.has(message.op))return Promise.reject(new Error('Operação do monitor inválida.'));
    if(queued>=128)return Promise.reject(new Error('Fila do monitor cheia.'));
    let payload;try{payload=JSON.stringify(message);}catch{return Promise.reject(new Error('Pedido do monitor inválido.'));}if(payload.length>16384)return Promise.reject(new Error('Pedido do monitor excedeu o limite.'));
    const instance=epoch;
    queued++;
    const execute=async()=>{if(instance!==epoch||stopping)throw new Error('Monitor encerrado ou reiniciado; pedido anterior cancelado.');if(!child||!ready)throw new Error('Monitor não iniciado.');await ready;if(failed)throw failed;
      return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{const error=new Error('O monitor não respondeu no prazo; confirme a recuperação antes de reiniciá-lo.');abort(error);},timeoutMs);
        pending={id,resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
        try{child.stdin.write(JSON.stringify({...JSON.parse(payload),id})+'\n',error=>{if(error&&instance===epoch)abort(error);});}catch(error){abort(error);}
      });};
    const result=tail.then(execute,execute);tail=result.catch(()=>{});return result.finally(()=>queued--);
  }
  async function stop(){stopping=true;++epoch;const old=child;child=null;cancelStart?.();cancelStart=null;pending?.reject(new Error('Monitor encerrado.'));pending=null;old?.removeAllListeners();old?.on('error',()=>{});old?.stdout.removeAllListeners('data');old?.stderr?.removeAllListeners('data');try{old?.kill();await tail;}finally{ready=null;failed=null;buffer='';target=null;stopping=false;}}
  const processOperation=req=>!['list','sample','getPower','setPower','getMemoryPriority','setMemoryPriority','set'].includes(req?.action)?Promise.reject(new Error('Operação de processo inválida.')):request({...req,op:req.action==='set'?'setPriority':req.action});
  const cpuOperation=args=>{
    if(!Array.isArray(args))return Promise.reject(new Error('Operação CPU inválida.'));
    if(args[0]==='topology'&&args.length===1)return request('topology');
    if(args[0]==='focused'&&args.length===2){if(Buffer.from(args[1],'base64').toString('utf8').toLowerCase()!==target?.toLowerCase())return Promise.reject(new Error('Alvo do monitor não confere.'));return request('focused');}
    if(args[0]==='get'&&args.length===2)return request({op:'getAffinity',pid:Number(args[1])});
    if(args[0]==='set'&&args.length===6)return request({op:'setAffinity',pid:Number(args[1]),startedAt:args[2],path:Buffer.from(args[3],'base64').toString('utf8'),expected:args[4],mask:args[5]});
    return Promise.reject(new Error('Operação CPU inválida.'));
  };
  return {start,stop,request,processOperation,cpuOperation,readActiveUser:async()=>{const value=await request('steamActiveUser');if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new Error('Conta ativa da Steam desconhecida.');return value;},isGameRunning:async()=>{const value=await request('snapshot');if(typeof value.running!=='boolean')throw new Error('Estado do jogo desconhecido.');return value.running;},isGameFocused:async()=>{const value=await request('focused');if(typeof value.focused!=='boolean')throw new Error('Foco desconhecido.');return value.focused;},status:()=>({running:!!child&&!failed,failed:failed?.message||null,queued})};
}

export async function runWatcherOperation({workerPath,gameExe,request,spawnImpl=spawn,timeoutMs=15000}={}){
  if(!request||!['list','set','getMemoryPriority','setMemoryPriority'].includes(request.action))throw new Error('Operação nativa de processos inválida.');
  const watcher=createWatcher({workerPath,spawnImpl,timeoutMs});
  try{await watcher.start(gameExe?{executablePath:gameExe}:{});return await watcher.processOperation(request);}
  finally{await watcher.stop();}
}

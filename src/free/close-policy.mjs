export function decideClose({session=null,benchmark=null,boost=null,operation=null}={}){
  const reasons=[];
  if(operation?.active)reasons.push('Aguarde a operação em andamento e confira a recuperação antes de fechar.');
  if(session)reasons.push('Use Desempenho → Encerrar sessão antes de fechar.');
  if(benchmark?.fpsCapRestoration?.pending)reasons.push('Feche o CS2 e restaure o limite FPS em Benchmark antes de fechar.');
  else if(benchmark?.active)reasons.push('Conclua ou cancele o benchmark antes de fechar.');
  // Stable persistent presets survive normal close/reboot. Incomplete writes
  // and recovery states still keep the window available for restoration.
  if(boost?.pendingRestore&&boost.status!=='active')reasons.push('Use Desempenho → Restaurar Boost Máximo antes de fechar.');
  return {allowed:reasons.length===0,reasons};
}

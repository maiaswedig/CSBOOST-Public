const edge='Software\\Policies\\Microsoft\\Edge',chrome='Software\\Policies\\Google\\Chrome';
export const BROWSER_POLICIES=Object.freeze([
  {id:'edgeBackground',browser:'edge',name:'Edge sem execução após fechar',key:edge,valueName:'BackgroundModeEnabled',description:'Impede aplicativos e extensões do Edge de permanecerem em segundo plano após fechar o navegador. Pode interromper notificações e tarefas de extensões.'},
  {id:'edgeStartup',browser:'edge',name:'Edge sem pré-carregamento',key:edge,valueName:'StartupBoostEnabled',description:'Desativa o pré-carregamento do Edge ao entrar no Windows. Pode reduzir processos residentes; a primeira abertura do navegador pode demorar mais.'},
  {id:'chromeBackground',browser:'chrome',name:'Chrome sem execução após fechar',key:chrome,valueName:'BackgroundModeEnabled',description:'Impede aplicativos e extensões do Chrome de permanecerem em segundo plano após fechar o navegador. Pode interromper notificações e tarefas de extensões.'},
].map(item=>Object.freeze({...item,after:{exists:true,type:'DWord',data:0}})));
export const isBrowserPolicy=(key,name)=>BROWSER_POLICIES.some(item=>item.key===key&&item.valueName===name);
export const BROWSER_POLICY_NOTE='Experimental, não validado nesta máquina: a gravação foi recusada pelo Windows. Opcional: cria uma política local do seu usuário e pode exibir “gerenciado” no navegador. Salve suas abas e reinicie o navegador para conferir o efeito. Restauração disponível; economia de RAM não medida.';
export function availableBrowserPolicies(inventory){
  if(!inventory||typeof inventory!=='object')return [];
  return BROWSER_POLICIES.filter(item=>{const browser=inventory[item.browser];return browser?.installed===true&&browser?.machineManaged===false&&Number.isInteger(browser.majorVersion)&&browser.majorVersion>=(item.browser==='edge'?88:77);});
}

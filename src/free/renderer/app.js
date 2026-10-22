'use strict';

(() => {
  const api = window.csboost;
  const app = document.getElementById('app');
  const svgNS = 'http://www.w3.org/2000/svg';
  const icons = {
    bolt: '<path d="M13.7 2.5 5 13h6l-.7 8.5L19 11h-6l.7-8.5Z"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
    performance: '<path d="M3 17a9 9 0 1 1 18 0M12 12l5-5M5 17h2m10 0h2M12 3v2M5.6 6.6 7 8"/><circle cx="12" cy="13" r="2"/>',
    crosshair: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    settings: '<path d="m9 3 6 .1.6 2.6 2.2 1.3 2.5-.8 2.8 5-2 1.8v2.5l2 1.8-2.8 4.9-2.6-.8-2.1 1.3-.6 2.6H9l-.6-2.6L6.2 21l-2.5.8-2.8-4.9 2-1.8v-2.5l-2-1.8 2.8-5 2.6.8 2.1-1.3L9 3Z" transform="translate(2 -1) scale(.82)"/><circle cx="12" cy="12" r="3"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    gpu: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="10" cy="12" r="3"/><path d="M16 10h2m-2 4h2M7 18v3m3-3v3m3-3v3M1 7v12"/>',
    memory: '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 10v4m4-4v4m4-4v4m4-4v4M5 17v3m4-3v3m4-3v3m4-3v3m4-3v3"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external: '<path d="M14 3h7v7m-1-6L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    play: '<path d="m8 4 12 8-12 8V4Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z"/><path d="m8 11 3 3 5-6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
    file: '<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Z"/><path d="M14 2v6h6M8 12h8m-8 4h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    save: '<path d="M4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z"/>',
    mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 9h12"/>',
    volume: '<path d="M3 9h4l5-4v14l-5-4H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>',
    logout: '<path d="M10 3H4v18h6m5-14 5 5-5 5M8 12h12"/>',
    power: '<path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    steam: '<circle cx="16.6" cy="7.6" r="3.6"/><circle cx="16.6" cy="7.6" r="1.9"/><path d="m13.3 6.2-5.5 8.1M16.8 11.2l-6.7 5.1M2 13l4.6 2.1m3.7 2-2.6-1.2"/><circle cx="7.5" cy="17" r="3.2"/>',
  };

  function icon(name, className = '') {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.65');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    svg.innerHTML = icons[name] || icons.info;
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svgNode(tag, attributes={}, text) {
    const node=document.createElementNS(svgNS,tag);for(const[name,value]of Object.entries(attributes))node.setAttribute(name,String(value));if(text!==undefined&&text!==null)node.textContent=String(text);return node;
  }

  function append(parent, ...children) {
    children.flat().filter(Boolean).forEach(child => parent.append(child));
    return parent;
  }

  function button(text, iconName, className, onClick) {
    const result = el('button', className || 'button button-secondary');
    result.type = 'button';
    if (iconName) result.append(icon(iconName));
    if (text) result.append(el('span', '', text));
    if (onClick) result.addEventListener('click', () => onClick(result));
    return result;
  }

  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ sensitivity: 2, zoomSensitivity:1, volume: 0.7, fpsMax: 400, crosshair: { version:3,size:2,gap:-2,thickness:.5,color:1,dot:false,outline:true,style:4,red:255,green:255,blue:255,alpha:255,useAlpha:true,outlineThickness:1,outlineMode:1,tStyle:false,followRecoil:false,sniperWidth:1,lengthPixels:2,gapPixels:1,thicknessPixels:2,screenHeight:1080,spreadLimit:255 }, viewmodelFov:68,viewmodel:{x:2.5,y:0,z:-1.5},video:{width:1920,height:1080,mode:'fullscreen',refreshHz:0},hud:{scale:.9,color:0},radar:{scale:.4,hudScale:1,centered:true,rotate:true},launch:{console:false,reloadKey:''},binds:[] });
  const numberText = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value)) : 'Não identificado';
  const measurementViews=window.createMeasurementViews?.({el,append,numberText,svg:svgNode});
  const frameSummary=summary=>measurementViews?.frameSummary(summary)||el('p','field-help','Frametimes indisponíveis.');
  const timeText=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('pt-BR',{timeZoneName:'short'}):'Não informado';
  const errorText = error => typeof error === 'string' ? error : error?.message || 'Não foi possível concluir esta ação. Tente novamente.';
  let state = { session: null, edition: 'free', version: '1.0.0' };
  let currentView = 'home';
  let data = { system: null, steam: null, profiles: [], power: null };
  let dataErrors = {};
  let selectedProfileId = null;
  let draft = defaults();
  let dirty = false;
  let loginBusy = false;
  let loginMode = 'openid';
  let loginError = '';
  let loginAttempt = 0;
  let toastTimer;
  let previousAccount = null;
  let authRefresh = null;
  const pageLoading = new Set();
  let optimizationPreset='fps',optimizationResolution='keep',optimizationRequest=0;
  let comparisonSelection={baselineIds:[],optimizedIds:[]},comparison=null;
  const defaultAdaptiveOptions={maxReductionsPerProcess:3,reapplicationWindowMs:600000,backoffBaseMs:30000};
  let adaptiveOptionsDraft={...defaultAdaptiveOptions};
  let sessionProcessPolicy={automatic:true,prioritizeGame:false,backgroundApps:[],backgroundMemoryPriorityApps:[],adaptiveOptions:{...adaptiveOptionsDraft}};
  let nvidiaPreset='recommended',nvidiaRequest=0;
  let benchmarkTuningNote='';
  let displayId='';
  let crosshairCodeText='',crosshairCodePreview=null,crosshairCodeExport=null;
  let boostSelection=null,boostResolution='keep',boostRequest=0,boostBusy=false,boostAutomatic=true,boostAdvancedOpen=false,performanceAdvancedOpen=false;
  let performanceTab='game';
  let boostCategory='all';
  let teamsTab='pros',proSearch='',proTeam='',proPlayerId='',proManualId='';
  let rankingSearch='',rankingPage=0;
  let proSections=['mouse','crosshair','viewmodel'],proProfileId=null,proDpi='',proProfileName='';
  let proRequest=0,proCatalogRequest=0,proPreviewRequest=0,proBusy=false,proImported=null;
  let renderedView=null,renderedAccount=null;
  let renderedMotionKey=null;
  let editorCategory='all';
  const mediaMemory=new Map(),mediaJobs=new Map();let mediaObserver=null,publicMediaEnabled=true;
  try{publicMediaEnabled=localStorage.getItem('csboost-public-media')!=='off';}catch{}

  function notify(message, isError = false) {
    if (!message) return;
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, isError ? 9500 : 6500);
  }

  async function action(control, operation, success) {
    if (control?.disabled) return;
    if (control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); }
    try {
      const result = await operation();
      if (success && !result?.canceled) notify(typeof success === 'function' ? success(result) : success);
      return result;
    } catch (error) {
      notify(errorText(error), true);
      return null;
    } finally {
      if (control) { control.disabled = false; control.removeAttribute('aria-busy'); }
    }
  }

  function titleBlock(title, description, eyebrow) {
    const result = el('div');
    if (eyebrow) result.append(el('p', 'eyebrow', eyebrow));
    append(result, el('h1', '', title), el('p', 'page-description', description));
    return result;
  }

  function note(text, neutral = false) {
    return append(el('div', neutral ? 'note note-neutral' : 'note'), icon('info'), el('p', '', text));
  }

  function errorBox(error) { return el('div', 'error-box', errorText(error)); }

  function panelHeader(iconName, title, subtitle) {
    return append(el('div', 'panel-header'), append(el('span', 'panel-header-icon'), icon(iconName)), append(el('div'), el('h2', '', title), subtitle && el('p', '', subtitle)));
  }

  function details(rows) {
    const list = el('ul', 'details-list');
    rows.forEach(([label, value, className]) => list.append(append(el('li'), el('span', '', label), el('strong', className || '', value))));
    return list;
  }

  function stat(iconName, label, value, detail) {
    return append(el('div', 'stat-card'), append(el('div', 'stat-head'), icon(iconName), el('span', '', label)), el('strong', '', value), el('small', '', detail));
  }

  function navigate(view) {
    if(view==='benchmark'&&currentView!==view)for(const key of ['benchmarks','benchmarkSetup','benchmarkRun']){delete data[key];delete dataErrors[key];}
    currentView = view;
    render();
  }

  function selectedProfile() { return data.profiles.find(profile => profile.id === selectedProfileId) || null; }

  function mergeSettings(settings) {
    const base = defaults();
    return { ...base, ...settings, ...Object.fromEntries(['crosshair','viewmodel','video','hud','radar','launch'].map(key=>[key,{...base[key],...settings?.[key]}])),binds:settings?.binds||[] };
  }

  async function loadData() {
    const sources = [ ['system', 'getSystemInfo'], ['steam', 'refreshSteam'], ['profiles', 'listProfiles'], ['power', 'getPowerPlans'] ];
    const results = await Promise.allSettled(sources.map(([, method]) => api[method]()));
    results.forEach((result, index) => {
      const key = sources[index][0];
      if (result.status === 'fulfilled') {
        data[key] = key === 'profiles' ? result.value || [] : result.value;
        delete dataErrors[key];
      } else dataErrors[key] = result.reason;
    });
    if (!selectedProfileId || !selectedProfile()) {
      selectedProfileId = data.profiles[0]?.id || null;
      draft = mergeSettings(selectedProfile()?.settings);
      dirty = false;
    }
  }

  async function refreshPart(key, method) {
    try {
      data[key] = await api[method]();
      delete dataErrors[key];
      render();
      return data[key];
    } catch (error) { dataErrors[key] = error; render(); throw error; }
  }

  async function syncAuth() {
    if (authRefresh) return authRefresh;
    authRefresh = (async () => {
      const next = await api.getState();
      state = next;
      const accountId = state.session?.steamId || null;
      if (accountId && accountId !== previousAccount) {
        optimizationRequest++;nvidiaRequest++;pageLoading.clear();comparison=null;comparisonSelection={baselineIds:[],optimizedIds:[]};adaptiveOptionsDraft={...defaultAdaptiveOptions};sessionProcessPolicy={automatic:true,prioritizeGame:false,backgroundApps:[],backgroundMemoryPriorityApps:[],adaptiveOptions:{...adaptiveOptionsDraft}};boostSelection=null;boostResolution='keep';boostAutomatic=true;boostAdvancedOpen=false;
        proRequest++;proCatalogRequest++;proPreviewRequest++;proBusy=false;proPlayerId='';proProfileId=null;proImported=null;
        previousAccount = accountId;
        data = { system: null, steam: null, profiles: [], power: null };
        dataErrors = {};
        selectedProfileId = null;
        dirty = false;
        render();
        await loadData();
        try{const flow=await api.getFpsFlow();data.fpsFlow=flow;data.gameSession=flow.session;if(flow.study?.status==='active')currentView='fps';}catch{}
      } else if (!accountId) {
        previousAccount = null;
        currentView = 'home';
      }
      if (accountId) { loginBusy = false; loginError = ''; }
      render();
    })();
    try { await authRefresh; } finally { authRefresh = null; }
  }

  async function login() { return authenticate('openid'); }
  async function loginLocal() { return authenticate('local'); }
  async function authenticate(mode) {
    if (loginBusy) return;
    const attempt = ++loginAttempt;
    loginMode = mode;
    loginBusy = true;
    loginError = '';
    render();
    try {
      await (mode==='local'?api.useLocalSteam():api.loginSteam());
      if (attempt !== loginAttempt) return;
      await syncAuth();
      if (!state.session) loginError = 'O login não foi concluído. Você pode tentar novamente.';
    } catch (error) {
      if (attempt === loginAttempt) loginError = errorText(error);
    } finally {
      if (attempt === loginAttempt) { loginBusy = false; render(); }
    }
  }

  async function cancelLogin(control) {
    ++loginAttempt;
    await action(control, () => api.cancelLogin());
    loginBusy = false;
    loginError = '';
    render();
  }

  function renderLogin() {
    const screen = el('main', 'login-screen');
    const main = el('div', 'login-main');
    const wordmark = append(el('h1', 'login-wordmark'), document.createTextNode('CS'), el('span', '', 'BOOST'));
    main.append(wordmark);
    const card = el('section', 'login-card');
    append(card, el('h2', '', 'Entrar'), el('p', '', 'Use sua conta Steam para acessar suas configurações.'));
    if (loginError) card.append(el('div', 'login-error', loginError));
    if (loginBusy) {
      const wait = append(el('div', 'login-wait'), el('span', 'spinner'), append(el('div'), el('strong', '', loginMode==='local'?'Conferindo a Steam neste PC':'Continue no navegador'), el('p', '', loginMode==='local'?'Verificando a conta ativa na instalação local da Steam.':'Confirme o acesso na página oficial da Steam. Esta janela será atualizada ao concluir.')));
      append(card, wait, button('Cancelar login', null, 'cancel-login', cancelLogin));
    } else append(card,button('Usar conta da Steam neste PC', 'steam', 'steam-button', loginLocal),button('Entrar com a Steam', 'lock', 'button button-quiet', login));
    append(card, append(el('p', 'login-trust'), icon('lock'), el('span', '', 'Conta local: funciona sem internet com a Steam aberta. Login pelo navegador: autenticação oficial.')));
    const distributionNotice=el('p','distribution-warning','Esta versão não tem assinatura digital. Antes de abrir um ZIP, confira o SHA-256 publicado no GitHub Releases oficial. O Windows pode mostrar um aviso de publicador desconhecido.');
    distributionNotice.setAttribute('role','note');card.append(distributionNotice);
    main.append(card);
    append(screen, main, append(el('footer', 'login-footer'), el('span', '', `CSBOOST ${state.version || '1.0.0'}`)));
    return screen;
  }

  const navigation = [ ['home', 'home', 'Início'], ['fps', 'bolt', 'FPS+'], ['performance', 'performance', 'Desempenho'], ['config', 'crosshair', 'Config do CS2'], ['benchmark','monitor','Benchmark'], ['news','file','Notícias'], ['rankings','performance','Ranking Valve'],['teams','steam','Times e configs'], ['settings', 'settings', 'Configurações'] ];

  function renderSidebar() {
    const sidebar = el('aside', 'sidebar');
    append(sidebar, append(el('div', 'sidebar-brand'), append(el('span', 'brand-icon'), icon('bolt')), append(el('strong'), document.createTextNode('CS'), el('span', '', 'BOOST'))), el('p', 'nav-label', 'MENU'));
    const ready=data.fpsFlow?.study?.status==='completed'&&!data.fpsFlow?.session;
    sidebar.append(button(ready?'Iniciar CS2':'Preparar FPS+','play','sidebar-launcher',control=>ready?action(control,async()=>{await api.startGameSession({preset:'balanced',provider:'steam',processPolicy:sessionProcessPolicy});data.fpsFlow=await api.getFpsFlow();data.gameSession=data.fpsFlow.session;navigate('fps');}):navigate('fps')));
    const nav = el('nav');
    nav.setAttribute('aria-label', 'Navegação principal');
    navigation.forEach(([view, iconName, label]) => {
      const item = button(label, iconName, `nav-item${currentView === view ? ' active' : ''}`, () => navigate(view));
      item.title = label;
      if (currentView === view) item.setAttribute('aria-current', 'page');
      nav.append(item);
    });
    sidebar.append(nav);
    const bottom = el('div', 'sidebar-bottom');
    const accountSettings = button('', 'settings', 'account-settings', () => navigate('settings'));
    accountSettings.title = 'Configurações da conta';
    accountSettings.setAttribute('aria-label', 'Configurações da conta');
    append(bottom, append(el('div', 'account'), append(el('div', 'account-avatar'), icon('steam')), append(el('div', 'account-info'), el('strong', '', state.session?.identitySource==='steam-local'?'Steam local · offline':'Conta Steam'), el('small', '', state.session?.steamId)), accountSettings));
    sidebar.append(bottom);
    return sidebar;
  }

  function renderShell() {
    const guidedWizard=currentView==='fps'&&!data.fpsFlow?.legacyStudyActive&&data.fpsFlow?.study?.status!=='completed';
    const shell = el('div', 'shell'+(guidedWizard?' fps-wizard-shell':''));
    const workspace = el('main', 'workspace');
    const breadcrumb = append(el('div', 'breadcrumb'), document.createTextNode('Meu espaço'), icon('chevron'), el('span', '', navigation.find(([view]) => currentView === view)?.[2]));
    append(workspace, append(el('header', 'topbar'), breadcrumb, append(el('div', 'topbar-right'), el('span', '', state.operation?.active?`Operação: ${state.operation.active.name}${state.operation.active.status==='indeterminate'?' — conferir recuperação':''}`:''), append(el('div', 'connected-pill'), el('span', 'status-dot'), el('span', '', state.session?.identitySource==='steam-local'?'Steam local':'Steam conectada')))));
    const page = el('div', 'page');
    if (currentView === 'performance') renderPerformance(page);
    else if (currentView === 'fps') renderGuidedFps(page);
    else if (currentView === 'config') renderConfig(page);
    else if (currentView === 'settings') renderSettings(page);
    else if (currentView === 'news') renderNews(page);
    else if (currentView === 'rankings') renderRankings(page);
    else if (currentView === 'teams') renderTeams(page);
    else if (currentView === 'benchmark') renderBenchmarks(page);
    else renderHome(page);
    workspace.append(page);
    append(shell, renderSidebar(), workspace);
    return shell;
  }

  function steamStatusPanel() {
    const steam = data.steam;
    const panel = el('section', 'panel');
    panel.append(panelHeader('steam', 'Steam', 'Instalação do jogo.'));
    const content = el('div', 'panel-content');
    if (dataErrors.steam) content.append(errorBox(dataErrors.steam));
    else if (!steam) content.append(el('p', 'empty-state', 'Verificando a instalação da Steam…'));
    else content.append(details([
      ['Steam', steam.installed ? 'Instalada' : 'Não encontrada', steam.installed ? 'success-text' : 'muted-text'],
      ['Counter-Strike 2', steam.cs2Installed ? 'Instalado' : 'Não encontrado', steam.cs2Installed ? 'success-text' : 'muted-text'],
      ['Perfis salvos', String(data.profiles.length)],
    ]));
    const refresh = button('Verificar', 'refresh', 'button button-quiet button-small', control => action(control, () => refreshPart('steam', 'refreshSteam'), 'Verificação da Steam concluída.'));
    append(panel, content, append(el('div', 'panel-footer'), el('p', '', 'Instalações detectadas neste computador.'), refresh));
    return panel;
  }

  function quickLink(iconName, title, text, destination) {
    const result = button('', null, 'quick-link', () => navigate(destination));
    append(result, icon(iconName, 'icon'), append(el('div', 'quick-text'), el('strong', '', title), el('p', '', text)), icon('chevron', 'chevron'));
    return result;
  }

  function renderHome(page) {
    const heading = append(el('div', 'page-heading'), titleBlock('Início', 'Visão geral do computador e acesso aos recursos.'));
    page.append(heading);
    const hero = el('section', 'hero');
    const heroContent = el('div', 'hero-content');
    append(heroContent, el('h2', '', 'Counter-Strike 2'), el('p', '', data.steam?.cs2Installed?'Instalado na Steam.':data.steam?'CS2 não detectado neste computador.':'Verificando instalação…'));
    const launch = button('Iniciar CS2', 'play', 'button button-primary', control => action(control, async()=>{data.gameSession=await api.startGameSession({preset:'balanced',provider:'steam',processPolicy:sessionProcessPolicy});navigate('performance');},'Sessão preparada. Inicialização solicitada à Steam.'));
    append(hero, heroContent, append(el('div', 'hero-actions'), launch));
    page.append(hero);
    append(page, append(el('div', 'section-heading'), el('h2', '', 'Computador'), append(el('span', 'section-meta'), icon('monitor'), el('span', '', 'Hardware detectado'))));
    if (dataErrors.system) page.append(errorBox(dataErrors.system));
    const system = data.system;
    append(page, append(el('div', 'stats-grid'), stat('cpu', 'PROCESSADOR', system?.cpu || 'Identificando…', system?.logicalCores ? `${system.logicalCores} processadores lógicos` : 'Informação do sistema'), stat('gpu', 'PLACA DE VÍDEO', system?.gpu || 'Não identificado', 'Adaptador de vídeo detectado'), stat('memory', 'MEMÓRIA RAM', system?.ramGB ? `${numberText(system.ramGB)} GB` : 'Identificando…', system?.os || system?.platform || 'Memória instalada')));
    const quick = el('section', 'panel');
    append(quick, panelHeader('bolt', 'Ferramentas', 'Ajustes e medições.'), append(el('div', 'panel-content quick-links'), quickLink('performance', 'Desempenho', 'Vídeo, sistema e sessão.', 'performance'), quickLink('monitor', 'Benchmark', 'Medições e comparação de FPS.', 'benchmark')));
    append(page, append(el('div', 'dashboard-grid'), steamStatusPanel(), quick), append(el('p', 'page-footnote'), icon('shield'), el('span', '', 'Ajustes com backup. Otimização de CPU durante a sessão de jogo.')));
  }

  async function refreshOptimization(){
    const request=++optimizationRequest;pageLoading.add('optimization');delete dataErrors.optimization;
    try{const result=await api.previewOptimization({preset:optimizationPreset,resolution:optimizationResolution});if(request===optimizationRequest)data.optimization=result;}
    catch(error){if(request===optimizationRequest)dataErrors.optimization=error;}
    finally{if(request===optimizationRequest){pageLoading.delete('optimization');render();}}
  }
  function renderOptimization(){
    const panel=el('section','panel content-card optimizer-panel');append(panel,el('h2','','Preset gráfico do CS2'),el('p','settings-description','Reduza o trabalho da GPU com opções reais do jogo. O efeito depende do gargalo do seu PC; confira o resultado no Benchmark.'));
    if(!data.optimization&&!dataErrors.optimization&&!pageLoading.has('optimization'))refreshOptimization();
    const row=el('div','button-row'),preset=el('select','native-select'),resolution=el('select','native-select');
    preset.setAttribute('aria-label','Preset gráfico');resolution.setAttribute('aria-label','Resolução do preset');
    for(const [value,label]of [['fps','Priorizar FPS'],['competitive','Equilíbrio visual (MSAA 2×)']]){const option=el('option','',label);option.value=value;preset.append(option);}preset.value=optimizationPreset;
    for(const [value,label]of [['keep','Manter resolução atual'],['1280x720','1280 × 720 · 16:9'],['1280x960','1280 × 960 · 4:3'],['1600x900','1600 × 900 · 16:9'],['1920x1080','1920 × 1080 · 16:9']]){const option=el('option','',label);option.value=value;resolution.append(option);}resolution.value=optimizationResolution;
    const change=()=>{optimizationPreset=preset.value;optimizationResolution=resolution.value;delete data.optimization;refreshOptimization();};preset.addEventListener('change',change);resolution.addEventListener('change',change);
    append(row,preset,resolution,button('Atualizar prévia','refresh','button button-secondary',()=>{delete data.optimization;refreshOptimization();}));panel.append(row);
    if(pageLoading.has('optimization')){panel.append(el('p','empty-state','Lendo as opções reais desta conta Steam…'));return panel;}
    if(dataErrors.optimization){panel.append(errorBox(dataErrors.optimization));return panel;}
    const plan=data.optimization;if(!plan)return panel;
    append(panel,el('p','settings-description',plan.description),el('p','field-help',`Resolução do preset: ${plan.width} × ${plan.height}. Taxa de atualização, sombras dinâmicas e Reflex são preservados.`));
    if(plan.pixelChangePercent>0.1)panel.append(note(`Esta resolução aumenta o número de pixels em ${numberText(plan.pixelChangePercent)}%. Isso pode reduzir o FPS.`));
    else if(plan.pixelChangePercent<-.1)panel.append(el('p','field-help',`${numberText(-plan.pixelChangePercent)}% menos pixels por quadro. Essa redução não equivale a um ganho de FPS nessa proporção.`));
    const show=value=>value==='0'?'0 (desativado/mínimo)':value;
    if(plan.changes.length){const table=el('table','optimization-table');append(table,append(el('thead'),append(el('tr'),el('th','','Opção'),el('th','','Atual'),el('th','','Preset'))));const body=el('tbody');for(const change of plan.changes)body.append(append(el('tr'),el('td','',change.label),el('td','',show(change.before)),el('td','',show(change.after))));table.append(body);panel.append(table);}
    else panel.append(el('p','success-text','As opções reconhecidas já correspondem a este preset. Não há ajustes para aplicar.'));
    panel.append(el('p','field-help',`${plan.already.length} opções já correspondem ao preset.${plan.unsupported.length?' Opções ausentes nesta versão foram preservadas: '+plan.unsupported.join(', ')+'.':''}`));
    if(plan.running)panel.append(note('Feche o CS2 para aplicar ou restaurar o preset.'));
    const actions=el('div','button-row');
    if(plan.active){
      append(panel,el('p','settings-description',`Backup disponível: ${plan.active.changedKeys} opções alteradas em ${new Date(plan.active.appliedAt).toLocaleString('pt-BR')}.`));
      if(plan.active.conflicts.length)panel.append(errorBox('Opções alteradas depois do preset: '+plan.active.conflicts.join(', ')+'. Ao restaurar, você poderá recuperar só as opções sem conflito ou manter os valores atuais e descartar o backup.'));
      const restore=button('Restaurar vídeo anterior','refresh','button button-secondary',control=>action(control,async()=>{const result=await api.restoreOptimization();await refreshOptimization();return result;},result=>result.canceled?'Nenhuma alteração foi feita.':result.discarded?'Backup descartado; os valores atuais foram mantidos.':result.pendingRestore?`${result.restoredItems?.length??0} opção(ões) restaurada(s). ${result.preserved?.length??0} valor(es) e o backup continuam guardados.`:'Opções de vídeo anteriores restauradas.'));restore.disabled=plan.running;actions.append(restore);
    }else{
      const apply=button('Aplicar preset de FPS','bolt','button button-primary',control=>action(control,async()=>{const result=await api.applyOptimization({preset:optimizationPreset,resolution:optimizationResolution,sourceSHA256:plan.sourceSHA256});data.optimization=result;render();return result;},result=>result.changed?'Preset gráfico aplicado com backup. Compare o FPS no Benchmark.':'As opções já correspondem ao preset.'));apply.disabled=plan.running||!plan.changes.length;actions.append(apply);
    }
    append(actions,button('Iniciar CS2','play','button button-secondary',control=>action(control,()=>api.launchCS2({withConfig:false}),result=>result.message)),button('Medir antes e depois','monitor','button button-quiet',()=>navigate('benchmark')));panel.append(actions);
    panel.append(el('p','field-help','O preset fica aplicado até você restaurar. Mantenha a resolução atual se não tiver certeza de que o monitor aceita outra. Uma sessão com perfil pessoal usa a resolução desse perfil.'));
    return panel;
  }
  let fpsView;
  function renderGuidedFps(page){
    loadPage('fpsFlow','getFpsFlow');
    if(dataErrors.fpsFlow){page.append(errorBox(dataErrors.fpsFlow));page.append(button('Atualizar FPS+','refresh','button button-secondary',control=>action(control,async()=>{delete dataErrors.fpsFlow;delete data.fpsFlow;render();})));return;}
    fpsView??=window.createFpsView({api,el,append,button,action,render,getData:()=>data,getAccount:()=>state.session?.steamId,navigate,errorBox,renderProcessPolicy,getProcessPolicy:()=>sessionProcessPolicy,renderComparisonStats,renderMeasurementSettings,numberText});fpsView.render(page);
  }
  function renderPerformance(page) {
    const refresh = button('Atualizar', 'refresh', 'button button-secondary', control => action(control, () => refreshPart('power', 'getPowerPlans')));
    append(page, append(el('div', 'page-heading'), titleBlock('Desempenho', 'Ajustes de vídeo, sistema e sessão.', 'OTIMIZAR PARA FPS'), refresh));
    const tabs=el('div','button-row performance-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Seções de desempenho');
    for(const [id,label,iconName] of [['game','Jogo e Windows','performance'],['hardware','CPU, RAM e GPU','cpu'],['history','Histórico','clock']]){const tab=button(label,iconName,`button ${performanceTab===id?'button-primary':'button-secondary'}`,()=>{performanceTab=id;render();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(performanceTab===id));tabs.append(tab);}page.append(tabs);
    if(performanceTab==='history'){page.append(renderChangeHistory());return;}
    if(performanceTab==='hardware'){
      page.append(el('p','settings-description','Orientação por hardware e acesso às ferramentas oficiais. O CSBOOST não aplica clocks, tensões ou timings de overclock automaticamente.'));
      page.append(renderFirmwareWorkflow(),renderAmdTuning(),renderMemoryTuning(),renderGpuOverclockGuide());return;
    }
    page.append(renderBoostPlan());
    const advanced=el('details','performance-advanced');advanced.open=performanceAdvancedOpen;advanced.addEventListener('toggle',()=>performanceAdvancedOpen=advanced.open);advanced.append(el('summary','','Configurações avançadas'));const advancedContent=el('div','performance-advanced-content');advanced.append(advancedContent);page.append(advanced);
    advancedContent.append(renderTopologyDiagnostics(),renderOptimization(),renderWindowsTuning(),renderNvidiaProfile(),renderExternalAdjustments(),renderPerformanceAudit(),renderShaderCache());
    const sessionAnchor=el('div');page.append(sessionAnchor);
    const power = data.power;
    const active = power?.plans?.find(plan => plan.guid === power.activeGuid || plan.active);
    if (active) append(advancedContent, append(el('section', 'power-active'), append(el('div', 'power-icon'), icon('power')), append(el('div', 'power-active-info'), el('span', 'text-label', 'PLANO DE ENERGIA ATUAL'), el('h2', '', active.name), el('p', '', 'Configuração ativa no Windows.')), el('span', 'tag', 'ATIVO AGORA')));
    const grid = el('div', 'performance-grid');
    const plans = el('section', 'panel');
    plans.append(panelHeader('performance', 'Planos disponíveis', 'Selecione apenas quando quiser fazer a alteração.'));
    const content = el('div', 'panel-content');
    if (dataErrors.power) content.append(errorBox(dataErrors.power));
    else if (!power) content.append(el('p', 'empty-state', 'Consultando planos de energia…'));
    else if (!power.plans?.length) content.append(el('p', 'empty-state', 'Nenhum plano de energia foi encontrado.'));
    else {
      const list = el('div', 'power-plans');
      power.plans.forEach(plan => {
        const isActive = plan.guid === power.activeGuid || plan.active;
        const select = button(isActive ? 'Em uso' : 'Ativar', isActive ? 'check' : null, `button ${isActive ? 'button-quiet' : 'button-secondary'} button-small`, control => action(control, async () => { await api.activatePowerPlan(plan.guid); await refreshPart('power', 'getPowerPlans'); }, 'Plano de energia alterado no Windows.'));
        select.disabled = isActive;
        append(list, append(el('div', `power-plan${isActive ? ' is-active' : ''}`), el('span', 'power-plan-indicator'), append(el('div', 'power-plan-info'), el('strong', '', plan.name), el('small', '', plan.guid)), select));
      });
      content.append(list);
    }
    plans.append(content);
    if (power?.restoreGuid) {
      const restore = button('Restaurar anterior', 'refresh', 'button button-secondary button-small', control => action(control, async () => { const result=await api.restorePowerPlan(); await refreshPart('power', 'getPowerPlans'); return result; }, result=>result?.canceled?'Nenhuma alteração foi feita.':result?.discarded?'Backup descartado; o plano atual foi mantido.':result?.pendingRestore?'O plano atual foi mantido. O backup continua disponível para resolver o conflito.':'Plano de energia anterior restaurado.'));
      append(plans, append(el('div', 'panel-footer'), el('p', '', 'Você pode voltar ao plano anterior.'), restore));
    }
    const info = el('div', 'info-stack');
    const machine = el('section', 'panel info-block');
    append(machine, el('h3', '', 'Informações do sistema'), details([
      ['Sistema', data.system?.os || data.system?.platform || 'Não identificado'],
      ['Memória RAM', data.system?.ramGB ? `${numberText(data.system.ramGB)} GB` : 'Não identificado'],
      ['Processadores lógicos', data.system?.logicalCores || 'Não identificado'],
    ]));
    const explanation = append(el('section', 'panel info-block'), el('h3', '', 'O que este ajuste faz?'), el('p', '', 'O plano de energia define como o Windows equilibra consumo e desempenho. O efeito depende do seu hardware e das configurações do sistema.'), el('p', '', 'Compare os logs reais na seção Benchmark. Nenhum ganho de desempenho é garantido.'));
    append(info, machine, explanation);
    append(grid, plans, info);
    append(advancedContent, grid);
    const sessionPanel=el('section','panel content-card session-panel');append(sessionPanel,el('h2','','Sessão de jogo'),el('p','settings-description','Use a configuração atual ou um perfil pessoal. Os ajustes temporários serão restaurados ao encerrar a sessão ou se o CSBOOST fechar inesperadamente.'));
    loadPage('sessionAutoAttach','getSessionAutoAttach');if(data.sessionAutoAttach){const automatic=el('input');automatic.type='checkbox';automatic.checked=data.sessionAutoAttach.enabled;automatic.setAttribute('aria-label','Conectar automaticamente quando detectar CS2');automatic.addEventListener('change',()=>action(automatic,async()=>{data.sessionAutoAttach=await api.setSessionAutoAttach(automatic.checked);render();},automatic.checked?'Detecção automática ativada.':'Detecção automática desativada.'));sessionPanel.append(append(el('label','checkbox-label'),automatic,document.createTextNode('Conectar automaticamente ao detectar o CS2')),el('p','field-help','Opcional. Ao ativar, o CSBOOST conecta uma sessão equilibrada ao detectar o CS2 aberto por qualquer launcher. Não relança o jogo nem aplica CFG. Você pode encerrar a sessão manualmente; a conexão não volta até o jogo fechar.'));}
    if(state.recovery){sessionPanel.append(el('p',state.recovery.available?'success-text':'error-box',state.recovery.available?'Proteção de recuperação ativa.':'Proteção de recuperação indisponível. Reabra o CSBOOST.'));
      const last=state.recovery.last;if(last){sessionPanel.append(el('p','field-help',`Última recuperação após fechamento: ${last.ok?'concluída':'terminou com avisos'}${last.finishedAt?' em '+new Date(last.finishedAt).toLocaleString('pt-BR'):''}.`));for(const error of last.errors||[])sessionPanel.append(el('p','field-help',error));}}
    loadPage('gameSession','getGameSession');const activeSession=data.gameSession;
    if(activeSession){
      const statusText={'preparing':'Preparando','waiting-for-game':'Aguardando o CS2','running':'Jogo em execução','recovery-required':'Restauração pendente'}[activeSession.status]||'Verificando';
      append(sessionPanel,el('p','',`Estado: ${statusText}${activeSession.error?' · '+activeSession.error:''}`));
      const captureStatus=activeSession.frameCapture?.status;if(captureStatus){sessionPanel.append(el('p','field-help',({prepared:'Frametimes preparados; a coleta começa quando o CSBOOST detectar o CS2.',capturing:'Frametimes sendo coletados em segundo plano por até seis minutos.',disabled:'Coleta detalhada de frametimes desativada.',unavailable:'Coleta detalhada indisponível nesta sessão.'})[captureStatus]||'Coleta de frametimes: '+captureStatus));if(captureStatus==='unavailable'&&activeSession.frameCapture.reason)sessionPanel.append(el('p','field-help',activeSession.frameCapture.reason));}
      if(activeSession.powerReport)sessionPanel.append(el('p','field-help',activeSession.powerReport));
      if(activeSession.topologySampling){const sample=activeSession.topologySampling,parkedText={yes:'Todos os domínios observados estavam estacionados.',no:'Nenhum domínio observado estava estacionado.',partial:'O estado de estacionamento variou entre domínios ou núcleos.',unknown:'Ainda não há uma leitura confiável.'}[sample.frequencyDomainParked]||'Ainda não há uma leitura confiável.';sessionPanel.append(el('p','field-help',`Topologia somente leitura · ${sample.enabled?'amostragem ativa a cada '+numberText(sample.intervalMs/1000)+' s':'amostragem inativa'} · ${parkedText}${sample.lastCapturedAt?' Última leitura: '+timeText(sample.lastCapturedAt)+'.':''}`));if(sample.lastError)sessionPanel.append(el('p','field-help','Diagnóstico de topologia: '+sample.lastError));}
      if(activeSession.processReport){const report=activeSession.processReport;sessionPanel.append(el('p',report.automatic?'field-help cpu-auto-live':'field-help',report.automatic?'CPU automática · '+(report.cpuPercent===null||report.cpuPercent===undefined?'analisando carga':numberText(report.cpuPercent)+'% de uso')+' · '+(report.totalApplied??0)+' ajustes temporários ativos.':'Prioridades confirmadas nesta sessão: '+(report.totalApplied??report.applied??'verificação incompleta')+'.'));(report.warnings||[]).forEach(warning=>sessionPanel.append(el('p','field-help',warning)));if(report.automatic&&report.reapplication){const policy=report.reapplication,counters=policy.processes.filter(item=>item.count>0),guard=el('details','cpu-auto-events');guard.append(el('summary','','Proteção contra oscilações · contadores'),el('p','field-help',`Até ${policy.maxReductionsPerProcess} reduções por processo em ${policy.windowMs/60000} min; após restaurar, o recuo cresce progressivamente a partir de ${policy.backoffBaseMs/1000} s. É um limite de proteção, não uma indicação de ajuste ideal.`));if(counters.length)for(const item of counters)guard.append(el('p','field-help',`${item.name}: ${item.count}/${item.limit} reduções nesta janela.`));else guard.append(el('p','field-help','Ainda não houve reduções nesta janela.'));sessionPanel.append(guard);}if(report.events?.length){const log=el('details','cpu-auto-events');log.append(el('summary','','Atividade da otimização de CPU'));for(const item of report.events.slice(-8).reverse())log.append(el('p','field-help',timeText(item.at)+' · '+item.name+': '+item.action+'.'));sessionPanel.append(log);}}
      if(activeSession.affinityReport){sessionPanel.append(el('p','field-help',`Afinidades confirmadas: ${activeSession.affinityReport.totalApplied??activeSession.affinityReport.applied??'verificação incompleta'}.`));(activeSession.affinityReport.warnings||[]).forEach(warning=>sessionPanel.append(el('p','field-help',warning)));}
      sessionPanel.append(button('Encerrar sessão','power','button button-secondary',control=>action(control,async()=>{await api.stopGameSession();data.gameSession=null;data.lastSessionSummary=await api.getLastSessionSummary();data.power=await api.getPowerPlans();delete data.engine;render();},'Sessão encerrada; energia e prioridades restauradas ou preservadas se alteradas externamente.')));
    } else {
      const row=el('div','button-row'),profileSelect=el('select','native-select'),mode=el('select','native-select');profileSelect.setAttribute('aria-label','Perfil da sessão');
      const currentConfig=el('option','','Usar configuração atual do jogo');currentConfig.value='';profileSelect.append(currentConfig);
      data.profiles.forEach(profile=>{const option=el('option','',profile.name);option.value=profile.id;profileSelect.append(option);});
      [['balanced','Manter o plano atual'],['performance','Alto desempenho se a política permitir']].forEach(([value,label])=>{const option=el('option','',label);option.value=value;mode.append(option);});mode.setAttribute('aria-label','Modo de energia da sessão');
      const sessionOptions=renderProcessPolicy();sessionPanel.append(el('p','field-help','Otimização automática de CPU: acompanha a carga, reduz prioridades de fundo somente quando necessário e restaura os ajustes ao terminar.'),sessionOptions);
      const launch=button('Iniciar sessão','play','button button-primary',control=>action(control,async()=>{data.gameSession=await api.startGameSession({profileId:profileSelect.value,preset:mode.value,processPolicy:sessionProcessPolicy});data.power=await api.getPowerPlans();render();},'Inicialização solicitada. Aguardando o processo do CS2.'));
      launch.disabled=!data.steam?.cs2Installed;append(sessionOptions,profileSelect,mode);row.append(launch);sessionPanel.append(row);
    }
    if(!activeSession)sessionPanel.append(button('Gerenciar CS2 já aberto','play','button button-secondary',control=>action(control,async()=>{data.gameSession=await api.startGameSession({preset:'balanced',processPolicy:sessionProcessPolicy,attachRunning:true});render();},'Sessão conectada ao jogo aberto.')),el('p','field-help','Abra o CS2 por qualquer launcher e conecte a sessão. A configuração do jogo é preservada; os ajustes temporários terminam quando ele fechar.'));
    if(!activeSession){loadPage('lastSessionSummary','getLastSessionSummary');if(data.lastSessionSummary&&measurementViews?.sessionSummary)sessionPanel.append(measurementViews.sessionSummary(data.lastSessionSummary));}
    sessionPanel.append(renderMeasurementSettings());
    sessionPanel.append(button('Exportar ajustes ativos','file','button button-quiet',control=>action(control,()=>api.exportSessionReport(),'Relatório da sessão exportado.')));
    sessionAnchor.append(sessionPanel);advancedContent.append(renderEngineAssessment());
  }

  function renderTopologyDiagnostics(){
    const panel=el('section','panel content-card topology-diagnostics');append(panel,el('h2','','Topologia da CPU'),el('p','settings-description','Diagnóstico experimental de núcleos e cache, somente leitura.'),button('Consultar topologia','cpu','button button-secondary',control=>action(control,async()=>{data.cpuTopology=await api.getCpuTopology();render();})));
    if(data.cpuTopology&&measurementViews)panel.append(measurementViews.topologyCard(data.cpuTopology));return panel;
  }
  function renderMeasurementSettings(){
    const panel=el('details','measurement-settings');panel.append(el('summary','','Configurações avançadas de medição'));
    loadPage('frameCapture','getFrameCaptureStatus');const info=data.frameCapture;if(dataErrors.frameCapture){panel.append(errorBox(dataErrors.frameCapture));return panel;}if(!info){panel.append(el('p','field-help','Consultando coletor de quadros…'));return panel;}
    const input=el('input');input.type='checkbox';input.checked=info.enabled===true;input.disabled=info.status==='unavailable'||!!data.gameSession||!!data.benchmarkRun?.active;input.setAttribute('aria-label','Coletar frametimes detalhados (experimental)');input.addEventListener('change',()=>action(input,async()=>{data.frameCapture=await api.configureFrameCapture({enabled:input.checked});render();}));
    append(panel,append(el('label','checkbox-label'),input,document.createTextNode('Coletar frametimes detalhados (experimental)')),el('p','field-help',info.reason||'Coleta opcional para benchmarks e sessões de CS2.'),el('p','field-help','PresentMon 2.3.1 · até seis minutos por sessão · sem overlay no jogo. A coleta é opcional e o custo medido é o do processo coletor, não uma estimativa de FPS.'),button('Como habilitar permissões','shield','button button-quiet',control=>action(control,()=>api.openFrameCaptureHelp())));return panel;
  }
  function renderWindowsTuning(){
    const panel=el('section','panel content-card optimizer-panel');append(panel,el('h2','','Windows e preferência de GPU'),el('p','settings-description','Ajustes do usuário do Windows, com estado anterior salvo. Eles ficam ativos até você restaurar; o benefício depende da carga do PC.'));
    panel.append(note('O modo de sessão já pode reduzir temporariamente a prioridade de navegadores e sincronizadores quando a CPU fica sob pressão. O CSBOOST não desativa serviços do Windows em massa: o uso e as dependências variam por computador, e serviços parados ou sob demanda geralmente não consomem CPU durante o jogo.'));
    loadPage('windowsTuning','getWindowsTuning');
    if(dataErrors.windowsTuning){append(panel,errorBox(dataErrors.windowsTuning),pageRefresh('windowsTuning','getWindowsTuning'));return panel;}
    const preview=data.windowsTuning;if(!preview){panel.append(el('p','empty-state','Lendo preferências do Windows…'));return panel;}
    const options=el('div','windows-options');
    for(const item of preview.items){const label=el('label','windows-option'),checkbox=el('input');checkbox.type='checkbox';checkbox.value=item.id;checkbox.checked=['gameMode','gpu'].includes(item.id)&&item.needed;checkbox.disabled=!!preview.active||!item.needed;checkbox.setAttribute('aria-label',item.name);append(label,checkbox,append(el('div'),el('strong','',item.name),el('p','field-help',item.description),el('p','field-help',item.needed?'Alteração disponível.':'Preferência já corresponde ao ajuste.')));options.append(label);}panel.append(options);
    if(preview.active)append(panel,el('p','settings-description',`Estado anterior salvo em ${new Date(preview.active.appliedAt).toLocaleString('pt-BR')}.`),button('Restaurar ajustes do Windows','refresh','button button-secondary',control=>action(control,async()=>{const result=await api.restoreWindowsTuning();await refreshPart('windowsTuning','getWindowsTuning');return result;},result=>result.canceled?'Nenhuma alteração foi feita.':result.discarded?'Backup descartado; os valores atuais foram mantidos.':result.pendingRestore?`${result.restoredItems.length} ajuste(s) restaurado(s). ${result.preserved.length} valor(es) e o backup continuam guardados.`:'Preferências anteriores do Windows restauradas.')));
    else panel.append(button('Aplicar ajustes selecionados','bolt','button button-primary',control=>action(control,async()=>{const ids=[...options.querySelectorAll('input:checked')].map(input=>input.value);data.windowsTuning=await api.applyWindowsTuning({ids,sourceSHA256:preview.sourceSHA256});render();},'Preferências gravadas e conferidas.')));
    append(panel,button('Verificar preferências','refresh','button button-quiet',control=>action(control,()=>refreshPart('windowsTuning','getWindowsTuning'))));return panel;
  }
  function renderShaderCache(){
    const panel=el('section','panel content-card shader-cache');append(panel,el('h2','','Reparar cache de shaders do CS2'),el('p','settings-description','Use quando houver suspeita de cache danificado. O cache anterior fica guardado para restaurar; o próximo início pode recompilar shaders e causar engasgos temporários. Limpar cache não garante mais FPS.'));
    const load=control=>action(control,async()=>{data.shaderCache=await api.getShaderCache();delete dataErrors.shaderCache;render();});
    panel.append(button('Analisar cache do CS2','refresh','button button-secondary',load));
    const info=data.shaderCache;if(!info)return panel;
    if(info.reason)panel.append(el('p','field-help',info.reason));if(!info.available)return panel;
    panel.append(details([['Arquivos encontrados',info.files],['Tamanho atual',`${numberText(info.bytes/2**20)} MB`],['Cópia anterior',info.pendingRestore?'Guardada, restauração disponível':'Nenhuma pendente']]));
    panel.append(el('p','field-help','O backup continua ocupando espaço. Somente o cache Steam do aplicativo 730 é movido; caches gerais do Windows e de outros jogos ficam fora deste recurso.'));
    if(info.pendingRestore){const restore=button('Restaurar cache anterior','refresh','button button-secondary',control=>action(control,async()=>{const result=await api.restoreShaderCache();data.shaderCache=await api.getShaderCache();render();return result;},result=>result.pendingRestore?`${result.targets.length} local(is) restaurado(s); ${result.preserved.length} continua(m) guardado(s) para correção.`:'Cache anterior restaurado. Um cache novo, se encontrado, ficou guardado separadamente.'));restore.disabled=!info.canRestore;panel.append(restore);}
    if(info.canDiscardRecovery)panel.append(button('Encerrar recuperação preservando caches','folder','button button-quiet',control=>action(control,async()=>{const result=await api.discardShaderCacheRecovery();data.shaderCache=await api.getShaderCache();render();return result;},result=>result.canceled?'Recuperação mantida.':'Recuperação encerrada; caches e recibo para recuperação manual preservados.')));
    if(!info.pendingRestore){const clear=button('Guardar cache e preparar recompilação','folder','button button-secondary',control=>action(control,async()=>{await api.clearShaderCache({previewFingerprint:info.previewFingerprint});data.shaderCache=await api.getShaderCache();render();},'Cache guardado. O jogo poderá gerar um cache novo na próxima execução.'));clear.disabled=!info.canClear;panel.append(clear);}
    return panel;
  }
  async function refreshBoost(selection=boostSelection){const request=++boostRequest;boostBusy=true;render();try{const result=await api.previewBoost(boostAutomatic?{automatic:true,resolution:'keep'}:{resolution:boostResolution,...(selection!==null?{selection}:{} )});if(request!==boostRequest)return;data.boostPlan=result;boostSelection=[...result.selectedIds];delete dataErrors.boostPlan;}catch(error){if(request===boostRequest)dataErrors.boostPlan=errorText(error);}finally{if(request===boostRequest){boostBusy=false;render();}}}
  function invalidateBoostModules(){for(const key of ['optimization','windowsTuning','nvidiaProfile','nvidia','engine','power','performanceAudit']){delete data[key];delete dataErrors[key];}}
  function renderBoostRecommendations(recommendation){
    const panel=el('section','boost-diagnosis-advice');panel.setAttribute('aria-label','Sugestões informativas do diagnóstico');
    const confidence={low:'baixa',medium:'média',high:'alta'}[recommendation.confidence]||'baixa';
    append(panel,el('div','boost-advice-heading'),el('span','eyebrow','ANÁLISE DO BENCHMARK'),el('h3','',recommendation.status==='available'?recommendation.title:'Sugestões do diagnóstico'));
    if(recommendation.status==='available')append(panel,el('p','boost-advice-class',`${recommendation.classLabel} · confiança qualitativa ${confidence}`));
    if(recommendation.measuredAt){const date=new Date(recommendation.measuredAt);if(Number.isFinite(date.getTime()))panel.append(el('p','field-help','Medição: '+date.toLocaleString('pt-BR')));}
    if(recommendation.prioritize?.length){const list=el('ul','boost-advice-list');for(const item of recommendation.prioritize){const row=el('li','');append(row,el('strong','',item.title),el('p','field-help',item.detail));if(item.state)row.append(el('small','boost-advice-state',`${item.area} · ${item.state}`));else if(item.area)row.append(el('small','boost-advice-state',item.area));list.append(row);}panel.append(list);}
    if(recommendation.avoid?.length){const list=el('ul','boost-advice-avoid');for(const item of recommendation.avoid)list.append(el('li','',item));panel.append(list);}
    panel.append(el('p','field-help boost-advice-notice',recommendation.notice));
    return panel;
  }
  function boostCategoryFor(item){
    if(['windows-edgeBackground','windows-edgeStartup','windows-chromeBackground'].includes(item.id))return 'apps';
    if(item.group==='nvidia'||item.id==='windows-gpu')return 'gpu';
    if(item.group==='video'||item.id==='windows-fso')return 'game';
    if(item.group==='power')return 'cpu';
    return 'windows';
  }
  function renderBackgroundApps(){
    const panel=el('section','background-apps-guide');
    loadPage('discordTuning','getDiscordTuning');
    append(panel,el('h3','','Apps e memória'),button('Analisar uso','refresh','button button-secondary button-small',control=>action(control,async()=>{data.backgroundAssessment=await api.getEngineAssessment();render();})),button('Inicialização','external','button button-quiet button-small',control=>action(control,()=>api.openBackgroundHelp({topic:'startup'}))));
    const assessment=data.backgroundAssessment;
    if(assessment){
      const rows=(assessment.processes?.available||[]).filter(item=>item.instances>0).sort((a,b)=>(b.memoryMB??0)-(a.memoryMB??0));
      const usage=el('details','app-usage-note');usage.append(el('summary','',rows.length?`Uso de memória · ${rows.length} apps`:'Resultado da análise'));
      if(!rows.length)usage.append(el('p','field-help',assessment.processes?'Nenhum aplicativo monitorado está aberto.':'Consulta indisponível. Tente novamente.'));
      for(const row of rows.slice(0,10))usage.append(el('p','field-help',`${row.name} · ${row.instances} processos · ${Number.isFinite(row.memoryMB)?Math.round(row.memoryMB)+' MB':'memória indisponível'}`));
      for(const warning of assessment.processes?.warnings||[])usage.append(el('p','field-help',warning));
      usage.append(el('p','field-help','Amostra de aplicativos conhecidos; memória compartilhada pode aparecer em mais de um processo. O CSBOOST não fecha aplicativos.'));panel.append(usage);
    }
    const discord=data.discordTuning,discordCard=el('article','network-adapter discord-tuning-card');
    const stateLabel=!discord?'Analisando':discord.active||discord.localActive||discord.startup?.active?'Backup salvo':!discord.available?'Não reconhecido':discord.running===false?'Pronto para ajustar':'Feche o Discord';
    append(discordCard,append(el('div','discord-tuning-heading'),el('h3','','Discord'),el('span','tag',stateLabel)));
    const apply=button('Desligar aceleração','bolt','button button-secondary button-small',control=>action(control,async()=>{data.discordTuning=await api.applyDiscordTuning({fingerprint:discord.fingerprint});render();},'Ajuste salvo. Ele terá efeito na próxima abertura do Discord.'));
    apply.setAttribute('aria-label','Desligar aceleração do Discord');
    apply.disabled=!discord?.available||discord.running!==false||discord.active||!discord.needed;
    const restore=button('Restaurar','refresh','button button-quiet button-small',control=>action(control,async()=>{data.discordTuning=await api.restoreDiscordTuning();render();},'Ajuste restaurado.'));
    restore.setAttribute('aria-label','Restaurar aceleração do Discord');
    restore.disabled=!discord?.active||discord.running!==false;
    const discordHint=!discord?'Consultando…':!discord.available?'Versão não validada':discord.active?'Backup disponível':!discord.needed?'Já desativada':discord.running===false?'Pronta para aplicar':'Feche o Discord';
    append(discordCard,append(el('div','discord-tuning-controls'),el('span','field-help',discordHint),apply,restore));
    const local=discord?.localSettings,localRows=el('div','discord-local-options');
    for(const [key,label]of [['minimizeToTray','Fechar para a bandeja'],['startMinimized','Iniciar minimizado']]){const setting=local?.[key];localRows.append(append(el('div','compact-guide-row'),el('strong','',label),el('span','field-help',setting?(setting.effective?'Ativo':'Desativado'):'Indisponível')));}
    const localApply=button('Reduzir execução em segundo plano','bolt','button button-secondary button-small',control=>action(control,async()=>{data.discordTuning=await api.applyDiscordLocalSettings({fingerprint:discord.fingerprint});render();},'Preferências locais ajustadas. O Discord precisa ser aberto novamente para confirmar o comportamento.'));
    localApply.setAttribute('aria-label','Desativar bandeja e início minimizado do Discord');
    localApply.disabled=!discord?.available||discord.running!==false||discord.localActive||!local?.minimizeToTray?.needed&&!local?.startMinimized?.needed;
    const localRestore=button('Restaurar início','refresh','button button-quiet button-small',control=>action(control,async()=>{data.discordTuning=await api.restoreDiscordLocalSettings();render();},result=>result?.partialRestore?'As preferências sem conflito foram restauradas; o restante continua salvo.':'Preferências locais restauradas.'));
    localRestore.setAttribute('aria-label','Restaurar comportamento de início do Discord');
    localRestore.disabled=!discord?.localActive||discord.running!==false;
    localRows.append(append(el('div','button-row discord-local-actions'),localApply,localRestore));
    const startup=discord?.startup,startupLabel=!startup?'Consultando…':!startup.available?'Não reconhecido':startup.enabled?'Ativo no Windows':'Desativado';
    const startupApply=button('Desativar início automático','bolt','button button-secondary button-small',control=>action(control,async()=>{data.discordTuning=await api.applyDiscordStartup({fingerprint:startup.fingerprint});render();},'O Discord não iniciará junto com o Windows.'));
    startupApply.setAttribute('aria-label','Desativar início automático do Discord');
    startupApply.disabled=!startup?.available||discord.running!==false||!startup.needed||startup.active;
    const startupRestore=button('Restaurar','refresh','button button-quiet button-small',control=>action(control,async()=>{data.discordTuning=await api.restoreDiscordStartup();render();},'Inicialização automática restaurada.'));
    startupRestore.setAttribute('aria-label','Restaurar início automático do Discord');
    startupRestore.disabled=!startup?.active||discord.running!==false;
    localRows.append(append(el('div','compact-guide-row'),el('strong','','Início com Windows'),el('span','field-help',startupLabel)),append(el('div','button-row discord-local-actions'),startupApply,startupRestore));
    if(startup?.reason)localRows.append(el('p','field-help',startup.reason));
    discordCard.append(localRows);
    if(discord&&(discord.running!==false)&&(discord.available||discord.active))discordCard.append(el('p','field-help discord-tuning-hint','Feche o Discord pela bandeja para alterar esta opção.'));
    panel.append(discordCard);
    const discordGuide=el('details','compact-guide');discordGuide.append(el('summary','','Mais ajustes do Discord'));
    discordGuide.append(el('p','field-help','Essas preferências são salvas pelo Discord na sua conta ou instalação. Confira-as no próprio aplicativo; o CSBOOST não altera sua conta.'));
    const discordHelp=el('div','button-row compact-guide-actions');
    for(const [label,topic]of [['Privacidade','privacy'],['Clipes','clips'],['Avisos do Windows','notifications'],['Overlay','overlay']])discordHelp.append(button(label,'external','button button-quiet button-small',control=>action(control,()=>api.openBackgroundHelp({topic}))));
    discordGuide.append(discordHelp);
    if(discord?.reason&&!discord.available)discordGuide.append(el('p','field-help',discord.reason));
    const discordRows=el('div','compact-guide-list');
    for(const [title,text]of [
      ['Privacidade','Desative uso de dados para melhorias, personalização e conteúdo patrocinado; revise a permissão de voz em clipes.'],
      ['Clipes','Desative captura, gravação contínua e lembretes se não usa; capturas podem pesar em PCs modestos.'],
      ['Notificações','Desative os avisos que não precisa durante o jogo.'],
      ['Sistema','O CSBOOST pode desligar início automático, início minimizado e permanência na bandeja; as alterações têm restauração.'],
      ['System Helper','Instale somente se um recurso que você usa solicitar.'],
      ['Sobreposição','Desative Overlay e Legacy Overlay se não usa esses recursos no CS2.'],
    ])discordRows.append(append(el('div','compact-guide-row'),el('strong','',title),el('span','field-help',text)));
    discordGuide.append(discordRows,button('Reanalisar','refresh','button button-quiet button-small',control=>action(control,async()=>{data.discordTuning=await api.getDiscordTuning();render();})));
    panel.append(discordGuide);
    const browsers=el('details','compact-guide');browsers.append(el('summary','','Navegadores'));
    for(const [title,text,topic]of [
      ['Chrome','Revise Economia de memória e preserve chamadas e páginas que precisam ficar ativas.','chrome'],
      ['Edge','Revise guias em suspensão e suas exceções.','edge'],
    ])browsers.append(append(el('div','compact-guide-row'),append(el('div'),el('strong','',title),el('span','field-help',text)),button('Abrir ajuda','external','button button-quiet button-small',control=>action(control,()=>api.openBackgroundHelp({topic})))));
    panel.append(browsers);return panel;
  }
  function renderNetworkDiagnostics(){
    const panel=el('section','network-diagnostics');append(panel,el('h3','','Rede para jogar'),el('p','field-help','Analise a conexão antes de alterar opções. Este diagnóstico não muda TCP, DNS ou serviços.'),button('Analisar conexão','refresh','button button-secondary',control=>action(control,async()=>{data.networkDiagnostics=await api.getNetworkDiagnostics();render();})),button('Abrir configurações de rede','external','button button-quiet',control=>action(control,()=>api.openNetworkSettings())));
    const info=data.networkDiagnostics;if(!info)return panel;
    for(const row of info.adapters)panel.append(append(el('article','network-adapter'),el('strong','',row.label),details([['Tipo',{wifi:'Wi-Fi',ethernet:'Ethernet',other:'Outro / virtual'}[row.type]||'Desconhecido'],['Estado',row.up?'Conectado':'Desconectado'],['Enlace',row.linkMbps==='unknown'?'Desconhecido':numberText(row.linkMbps)+' Mbps']])));
    for(const text of info.notes)panel.append(el('p','field-help',text));return panel;
  }
  function renderBoostPlan(){
    const panel=el('section','panel content-card boost-panel');append(panel,append(el('div','boost-heading'),append(el('div'),el('span','eyebrow','AJUSTES PARA ESTE PC'),el('h2','','Boost Máximo')),icon('bolt')),el('p','settings-description','O CSBOOST analisa o computador e prepara os ajustes compatíveis para priorizar FPS.'));
    loadPage('boostPlan','previewBoost',boostAutomatic?{automatic:true}:{resolution:boostResolution,...(boostSelection!==null?{selection:boostSelection}:{})});const info=data.boostPlan;if(dataErrors.boostPlan){append(panel,errorBox(dataErrors.boostPlan),button('Atualizar Boost','refresh','button button-secondary',()=>refreshBoost()));return panel;}if(!info){panel.append(el('p','field-help','Verificando os ajustes disponíveis…'));return panel;}
    if(info.state.pendingRestore)boostSelection=[...info.state.selectedIds];else if(boostSelection===null)boostSelection=[...info.selectedIds];
    const summary=el('div','boost-auto-summary');summary.append(el('span','tag',info.state.pendingRestore?(info.state.automatic===true?'Automático':info.state.automatic===false?'Personalizado':'Ativo'):boostAutomatic?'Automático':'Personalizado'),el('p','',info.state.pendingRestore?'Ajustes ativos · restauração disponível':info.selectedIds.length?`${info.selectedIds.length} ajustes prontos para este PC`:info.items.some(item=>item.status==='already')?'O PC já está otimizado com estas opções':'Nenhum ajuste novo disponível'));panel.append(summary);if(info.diagnosisRecommendations){const advice=el('details','compact-guide boost-insights');advice.append(el('summary','','Sugestões do diagnóstico'),renderBoostRecommendations(info.diagnosisRecommendations));panel.append(advice);}
    const categories=el('div','boost-categories');categories.setAttribute('role','tablist');categories.setAttribute('aria-label','Categorias dos boosters');
    for(const [id,label]of [['all','Todos'],['gpu','GPU'],['game','Jogo'],['windows','Windows'],['cpu','CPU e energia'],['network','Rede'],['apps','Apps e memória']]){
      const categoryItems=info.items.filter(item=>id==='all'||boostCategoryFor(item)===id),count=id==='network'?null:categoryItems.length;
      const selectedCount=id==='network'?null:categoryItems.filter(item=>boostSelection.includes(item.id)).length;
      const suffix=count===null?'':` · ${selectedCount}/${count}`;
      const tab=button(label+suffix,null,'button button-small '+(boostCategory===id?'button-primary':'button-secondary'),()=>{boostCategory=id;boostAdvancedOpen=true;render();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(boostCategory===id));tab.setAttribute('aria-label','Categoria '+label+(count===null?'':`, ${selectedCount} de ${count} selecionados`));categories.append(tab);
    }panel.append(categories);
    if(boostCategory==='apps')panel.append(renderBackgroundApps());
    if(boostCategory==='network')panel.append(renderNetworkDiagnostics());
    if(boostCategory==='cpu')panel.append(el('p','field-help','A energia fica nesta categoria. O governador de CPU atua durante a sessão de jogo, no painel abaixo; não é uma alteração permanente.'));
    const advanced=el('details','boost-advanced');advanced.open=boostAdvancedOpen;advanced.addEventListener('toggle',()=>boostAdvancedOpen=advanced.open);advanced.append(el('summary','','Personalizar boosters'));const manual=el('input');manual.type='checkbox';manual.checked=!boostAutomatic;manual.disabled=boostBusy||info.state.pendingRestore;manual.setAttribute('aria-label','Personalizar seleção dos boosters');manual.addEventListener('change',()=>{boostAutomatic=!manual.checked;boostResolution='keep';boostSelection=null;refreshBoost(null);});advanced.append(append(el('label','checkbox-label'),manual,document.createTextNode('Escolher boosters manualmente')));
    const resolution=el('select','native-select');resolution.setAttribute('aria-label','Resolução do Boost');for(const [value,label]of [['keep','Manter resolução atual'],['1280x720','1280 × 720'],['1280x960','1280 × 960'],['1600x900','1600 × 900'],['1920x1080','1920 × 1080']]){const option=el('option','',label);option.value=value;resolution.append(option);}resolution.value=boostResolution;resolution.disabled=boostAutomatic||boostBusy||info.state.pendingRestore;resolution.addEventListener('change',()=>{boostResolution=resolution.value;refreshBoost();});append(advanced,append(el('div','button-row'),resolution,button('Usar recomendados','check','button button-secondary button-small',()=>refreshBoost(null))));panel.append(button('Analisar novamente','refresh','button button-quiet button-small',()=>refreshBoost()));
    const list=el('div','boost-options');for(const item of info.items){const row=el('article','boost-option'),checkbox=el('input');row.dataset.category=boostCategoryFor(item);row.hidden=boostCategory!=='all'&&boostCategoryFor(item)!==boostCategory;checkbox.type='checkbox';checkbox.className='boost-toggle';checkbox.checked=boostSelection.includes(item.id);checkbox.disabled=boostBusy||!item.selectable;checkbox.setAttribute('aria-label','Boost: '+item.name);checkbox.addEventListener('change',()=>{const selected=new Set(boostSelection);if(checkbox.checked){selected.add(item.id);if(item.id==='nvidia-low-latency')selected.delete('nvidia-low-latency-ultra');if(item.id==='nvidia-low-latency-ultra')selected.delete('nvidia-low-latency');}else selected.delete(item.id);boostSelection=[...selected];refreshBoost();});const status={needed:'Disponível',already:'OK',pending:'Restaurar',unavailable:'Indisponível'}[item.status];append(row,append(el('label','boost-option-title'),checkbox,el('strong','',item.name),...(item.risk==='high'?[el('span','tag boost-risk-tag','Experimental')]:[]),el('span','tag',status)));const infoDetails=el('details','boost-option-details');infoDetails.append(el('summary','','Detalhes'),el('p','field-help',item.reason));for(const tradeoff of item.tradeoffs)infoDetails.append(el('p','field-help',tradeoff));if(item.changes.length){const differences=el('details','audit-limits');differences.append(el('summary','',`Alterações (${item.changes.length})`));for(const change of item.changes){const value=input=>typeof input==='object'?JSON.stringify(input):String(input??'Não definido');differences.append(el('p','field-help',`${change.label}: ${value(change.before)} → ${value(change.after??change.value)}.`));}infoDetails.append(differences);}row.append(infoDetails);list.append(row);}panel.append(list);
    list.querySelectorAll('input').forEach(input=>input.disabled=boostAutomatic||input.disabled);advanced.append(list);advanced.hidden=boostCategory==='network';panel.append(advanced);
    const activate=button(boostBusy?'Aguarde…':'Ativar Boost Máximo','bolt','button button-primary',control=>action(control,async()=>{boostBusy=true;render();try{await api.applyBoost({automatic:boostAutomatic,previewFingerprint:info.previewFingerprint,selectedIds:boostSelection,resolution:boostResolution});invalidateBoostModules();}finally{boostBusy=false;await refreshBoost(null);}},'Boost Máximo aplicado. Compare FPS e 1% low no benchmark.'));activate.disabled=boostBusy||!info.canApply||info.state.pendingRestore;
    const restore=button('Restaurar Boost Máximo','refresh','button button-secondary',control=>action(control,async()=>{boostBusy=true;render();try{const result=await api.restoreBoost();invalidateBoostModules();return result;}finally{boostBusy=false;await refreshBoost(null);}},result=>result?.canceled?'Nenhuma alteração foi feita.':result?.partialRestore?'Os valores sem conflito foram restaurados. Os demais backups continuam disponíveis.':result?.pendingRestore?'O Boost continua ativo; confira os módulos com recuperação pendente.':'Ajustes próprios do Boost restaurados.'));restore.disabled=boostBusy||!info.state.pendingRestore;
    panel.insertBefore(append(el('div','button-row'),activate,restore,button('Validar no benchmark','monitor','button button-quiet',()=>navigate('benchmark'))),advanced);append(panel,el('p','field-help','Gráficos podem perder qualidade para priorizar FPS. Os ajustes ficam ativos até restaurar. Resolução, limite de FPS e gravação são preservados no modo automático.'));
    if(info.state.error)panel.append(note(info.state.error,true));for(const text of info.hardwarePending)advanced.append(el('p','field-help',text));return panel;
  }
  function renderFirmwareWorkflow(){
    const panel=el('section','panel content-card firmware-workflow');append(panel,el('h2','','PBO/CO e XMP/EXPO'),el('p','settings-description','Prepare o ajuste com uma referência deste hardware, abra a ferramenta oficial ou BIOS e confira as propriedades disponíveis ao voltar. Os ajustes são realizados na BIOS ou na ferramenta AMD.'));
    loadPage('firmwareWorkflow','getFirmwareWorkflow');const info=data.firmwareWorkflow;if(dataErrors.firmwareWorkflow){append(panel,errorBox(dataErrors.firmwareWorkflow),pageRefresh('firmwareWorkflow','getFirmwareWorkflow'));return panel;}if(!info){panel.append(el('p','field-help','Consultando acompanhamento…'));return panel;}
    const flow=info.workflow,active=flow&&!['checked','cancelled'].includes(flow.status);
    const prepare=kind=>button(kind==='pbo'?'Preparar PBO/CO':'Preparar XMP/EXPO',kind==='pbo'?'cpu':'memory','button button-secondary',control=>action(control,async()=>{data.firmwareWorkflow=await api.prepareFirmwareWorkflow({kind});render();},'Referência de hardware guardada. O ajuste ainda deve ser feito na ferramenta/BIOS.'));
    const pbo=prepare('pbo'),xmp=prepare('xmp');pbo.disabled=!!active||info.otherAccount||!data.amdTuning?.hardware?.pboCandidate;xmp.disabled=!!active||info.otherAccount||!data.memoryTuning?.available;append(panel,append(el('div','button-row'),pbo,xmp));if(info.otherAccount)panel.append(note('Há um acompanhamento de outra conta Steam. Entre na conta que o preparou.',true));
    if(flow){const status={prepared:'Referência preparada','tool-opened':'Ferramenta AMD aberta','restart-requested':'Reinício solicitado',checked:'Conferência concluída',cancelled:'Acompanhamento encerrado'}[flow.status];append(panel,details([['Acompanhamento',flow.kind==='pbo'?'CPU · PBO/CO':'Memória · XMP/EXPO'],['Etapa',status],['Referência',timeText(flow.createdAt)],['Placa / BIOS',`${flow.before.board} · ${flow.before.bios}`],['Frequência antes',flow.before.clocks.map(value=>numberText(value)+' MHz').join(' / ')]]));
      if(active){if(flow.kind==='pbo'){const open=button('Abrir Ryzen Master para PBO','external','button button-primary',control=>action(control,async()=>{data.firmwareWorkflow=await api.openFirmwarePbo();render();},'Ferramenta AMD aberta. Anote os valores anteriores; o CSBOOST não aplica offsets.'));open.disabled=!data.amdTuning?.ryzenMaster?.canLaunch;panel.append(open);}else{panel.append(el('p','field-help',flow.before.guide?.location||'Consulte o manual da placa e escolha um perfil compatível com o kit.'));const restart=button('Reiniciar na BIOS','power','button button-primary',control=>action(control,()=>api.restartToFirmware(),result=>result.canceled?'Reinício cancelado.':'Solicitação de reinício enviada ao Windows.'));restart.disabled=!info.platform?.canRequestRestart;append(panel,append(el('div','button-row'),restart,button('Opções de recuperação do Windows','settings','button button-secondary',control=>action(control,()=>api.openWindowsRecovery()))),el('p','field-help',info.platform?.reason||'Abertura direta da BIOS não confirmada.'));}
        const notes=el('textarea','native-select');notes.rows=2;notes.maxLength=500;notes.placeholder='Opcional: o que você alterou na BIOS/ferramenta';notes.setAttribute('aria-label','Observações de PBO/XMP');let manual=null;if(flow.kind==='xmp'&&(!flow.bootReadAvailable||!info.platform?.bootId)){manual=el('input');manual.type='checkbox';panel.append(append(el('label','checkbox-label'),manual,document.createTextNode('Reiniciei manualmente após o ajuste')));}append(panel,notes,append(el('div','button-row'),button('Conferir PBO/XMP','check','button button-secondary',control=>action(control,async()=>{data.firmwareWorkflow=await api.checkFirmwareWorkflow({notes:notes.value,confirmManualRestart:!!manual?.checked});delete data.memoryTuning;render();},'Propriedades disponíveis conferidas. Compare desempenho e estabilidade.')),button('Encerrar acompanhamento','trash','button button-quiet',control=>action(control,async()=>{data.firmwareWorkflow=await api.cancelFirmwareWorkflow();render();},'Acompanhamento encerrado; isso não desfaz mudanças de firmware.'))));
      }
      if(flow.verification){const check=flow.verification;append(panel,el('p','field-help',check.message),details([['Reinício observado',check.bootChanged===null?'Não confirmado':check.bootChanged?'Sim':'Não'],['Novos eventos WHEA',check.stability.available?String(check.stability.count):'Consulta indisponível']]));for(const change of check.memory.changes||[])panel.append(el('p','field-help',`${change.label}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}.`));for(const warning of [...(check.memory.warnings||[]),...(check.stability.warnings||[])])panel.append(note(warning,true));}
    }
    panel.append(el('p','field-help',info.reason));return panel;
  }
  function renderGpuOverclockGuide(){
    const panel=el('section','panel content-card gpu-overclock-guide');
    const gpu=String(data.system?.gpu||'Não identificada'),cpu=String(data.system?.cpu||'Não identificado');
    loadPage('gpuDiagnostics','getGpuDiagnostics');const report=data.gpuDiagnostics;
    const fallback=[];if(/nvidia|geforce|quadro|rtx|gtx/i.test(gpu))fallback.push('NVIDIA');if(/amd|radeon/i.test(gpu))fallback.push('AMD');if(/intel|arc|iris|uhd/i.test(gpu))fallback.push('Intel');
    const vendors=[...new Set([...(report?.available?report.vendors:[]),...fallback])],adapters=report?.available?report.adapters:[];
    append(panel,el('h2','','GPU e perfil do jogo'),el('p','settings-description','O CSBOOST identifica o fabricante e prepara o ajuste por jogo que cada driver oferece.'));
    panel.append(details([['GPU detectada',adapters.map(item=>item.name).join(', ')||gpu],['Fabricante',report?.available?report.primaryVendor:vendors.join(' + ')||'Não identificado'],['AMD Software',vendors.includes('AMD')?(report?.amd?.adrenalinInstalled?'Instalado e assinatura AMD confirmada':'Não localizado com assinatura AMD válida'):'Não aplicável'],['Processador',cpu]]));
    if(!report?.available&&!pageLoading.has('gpuDiagnostics'))panel.append(note(report?.reason||'O Windows não informou os IDs dos adaptadores. O nome detectado ainda é usado para mostrar o guia.',true));
    if(vendors.includes('NVIDIA')){
      panel.append(el('h3','','NVIDIA · perfil do CS2'),el('p','field-help','O perfil NVIDIA por jogo pode ser aplicado pelo CSBOOST quando a NVAPI confirma suporte. Ele aparece na categoria GPU dos boosters e nas configurações avançadas, com prévia e restauração.'));
      panel.append(button('Abrir Painel NVIDIA','external','button button-secondary',control=>action(control,()=>api.openNvidiaControlPanel())));
    }
    if(vendors.includes('AMD')){
      panel.append(el('h3','','AMD Radeon · perfil Adrenalin para CS2'),el('p','field-help','Use o perfil do CS2, sem mudar os gráficos globais. O CSBOOST aplica a preferência do Windows para GPU de alto desempenho; os controles abaixo são configurados no Adrenalin oficial.'));
      const rows=el('div','compact-guide-list');for(const setting of report?.profile?.amd||[]){rows.append(append(el('div','compact-guide-row'),append(el('div'),el('strong','',setting.name),el('span','field-help',setting.reason)),el('span','tag',setting.value)));}panel.append(rows);
      panel.append(el('p','field-help','O Anti-Lag é mais indicado quando o jogo está limitado pela GPU. O Radeon Boost pode reduzir a resolução durante movimentos; o Chill limita dinamicamente os quadros e conflita com Anti-Lag/Boost. Compare cada escolha no benchmark.'));
    }
    if(vendors.includes('Intel'))panel.append(el('p','field-help','Intel Arc detectada: o CSBOOST usa as opções do jogo e a preferência de GPU do Windows; abra o Arc Control para ajustes específicos do driver.'));
    if(/intel/i.test(cpu))panel.append(note('CPU Intel detectada. O Intel XTU depende de um processador desbloqueado compatível e de um chipset adequado. Confira o modelo exato e a placa no suporte oficial antes de instalar; o CSBOOST ainda não valida automaticamente a elegibilidade Intel.',true));
    if(!vendors.length)panel.append(note('O fabricante da GPU não foi reconhecido pelo Windows. Confira o modelo antes de escolher uma ferramenta.',true));
    const actions=el('div','button-row'),open=(label,id)=>button(label,'external','button button-secondary',control=>action(control,()=>api.openHardwareTuningLink(id),'Página oficial aberta no navegador.'));
    if(vendors.includes('NVIDIA')||!vendors.length)actions.append(open('NVIDIA App · ajuste automático','nvidia-app'));
    if(vendors.includes('AMD')){
      const adrenalin=button(report?.amd?.adrenalinInstalled?'Abrir AMD Software: Adrenalin':'Baixar AMD Software: Adrenalin','external','button button-secondary',control=>action(control,()=>report?.amd?.adrenalinInstalled?api.launchAdrenalin():api.openHardwareTuningLink('amd-adrenalin'),report?.amd?.adrenalinInstalled?'AMD Software aberto. Configure o perfil do CS2 e valide no benchmark.':'Página oficial da AMD aberta.'));
      actions.append(adrenalin,open('Guia oficial de gráficos por jogo','amd-graphics-settings'));
    }
    if(vendors.includes('Intel')||!vendors.length)actions.append(open('Guia Intel Arc Control','intel-arc'));
    if(/intel/i.test(cpu))actions.append(open('Intel XTU · conferir compatibilidade','intel-xtu'));
    actions.append(open('MSI Afterburner · OC Scanner','msi-afterburner'),button('Analisar Boosts deste PC','bolt','button button-primary',()=>{performanceTab='game';render();}));panel.append(actions);
    panel.append(el('p','field-help','A aba Desempenho aplica automaticamente as opções compatíveis; o perfil NVIDIA pode ser escrito e restaurado pelo CSBOOST. As opções de imagem Radeon ficam sob controle do Adrenalin e precisam ser conferidas no próprio perfil do CS2.'));
    panel.append(note('Este guia não grava frequência, tensão, limite de energia nem curva de ventoinha. Overclock pode causar travamentos e calor adicional. Use o teste do fabricante na própria placa e restaure o padrão se houver instabilidade.',true));
    return panel;
  }
  function renderAmdTuning(){
    const panel=el('section','panel content-card amd-tuning');append(panel,el('h2','','PBO / Curve Optimizer AMD'),el('p','settings-description','Confira o hardware e use o Ryzen Master oficial para ajustar PBO/CO. O CSBOOST registra medições e erros de hardware para comparar o resultado.'));
    loadPage('amdTuning','getAmdTuning');const amd=data.amdTuning;
    if(dataErrors.amdTuning){append(panel,errorBox(dataErrors.amdTuning),pageRefresh('amdTuning','getAmdTuning'));return panel;}
    if(!amd){panel.append(el('p','empty-state','Verificando CPU, placa, BIOS e Ryzen Master…'));return panel;}
    panel.append(details([['Processador',amd.cpu?.name||'Não identificado'],['Placa-mãe',amd.board?.product||'Não identificada'],['BIOS',amd.bios?.version||'Não identificada'],['Ryzen Master',amd.ryzenMaster?.installed?(amd.ryzenMaster.canLaunch?'Instalado e assinatura AMD validada':'Instalado; validação pendente'):'Não instalado']]));
    const driver=amd.ryzenMaster?.driver;if(driver)panel.append(details([['Driver do Ryzen Master',driver.present?`${driver.name} · ${driver.running?'Em execução':'Parado'}`:'Não encontrado'],['Assinatura do driver no disco',driver.onDiskVerified?'AMD validada':'Não confirmada'],['Aplicação direta pelo CSBOOST',amd.directControl?.available?'Disponível':'Ainda indisponível']]));
    panel.append(el('p','field-help',amd.reason));
    panel.append(el('p','field-help','Os valores atuais de PBO/CO não foram lidos do firmware. Mudanças feitas no Ryzen Master/BIOS são restauradas por essas ferramentas. O monitor do CSBOOST restaura somente os ajustes temporários próprios.'));
    const actions=el('div','button-row');const launch=button('Abrir Ryzen Master','external','button button-secondary',control=>action(control,()=>api.launchRyzenMaster()));launch.disabled=!amd.ryzenMaster?.canLaunch;
    append(actions,launch,button('Baixar Ryzen Master oficial','download','button button-secondary',control=>action(control,()=>api.openAmdDownload())),button('Guia AMD de PBO/CO','info','button button-quiet',control=>action(control,()=>api.openAmdGuide())),pageRefresh('amdTuning','getAmdTuning'));panel.append(actions);
    append(panel,el('h3','','Verificar erros de hardware'),el('p','field-help','Consulte os eventos WHEA da última hora. Eles podem ter outras causas; ausência de eventos não comprova estabilidade do ajuste.'),button('Consultar WHEA','refresh','button button-secondary',control=>action(control,async()=>{data.amdStability=await api.readAmdStability();render();})));
    const stability=data.amdStability;if(stability){panel.append(el('p','field-help',stability.available?`${stability.events.length} eventos registrados entre ${new Date(stability.since).toLocaleTimeString('pt-BR')} e ${new Date(stability.until).toLocaleTimeString('pt-BR')}.${stability.truncated?' Lista limitada; há mais eventos.':''}`:stability.reason||'Leitura WHEA indisponível.'));if(stability.available&&stability.events.length){const list=el('ul');for(const event of stability.events.slice(0,20))list.append(el('li','field-help',`${new Date(event.time).toLocaleString('pt-BR')} · WHEA ${event.eventId} · nível ${event.level}`));panel.append(list);}}
    panel.append(button('Comparar PBO/CO no benchmark','monitor','button button-quiet',()=>navigate('benchmark')));return panel;
  }
  function renderExternalAdjustments(){
    const panel=el('section','panel content-card external-audit');panel.setAttribute('aria-label','Auditoria de ajustes externos');
    append(panel,el('h2','','Auditoria de ajustes externos'),el('p','settings-description','Consulta somente leitura de planos, serviços, valores conhecidos e divergências registradas. A auditoria não aplica nem desfaz ajustes.'));
    loadPage('externalAdjustments','getExternalAdjustments');
    if(dataErrors.externalAdjustments){append(panel,errorBox(dataErrors.externalAdjustments),pageRefresh('externalAdjustments','getExternalAdjustments'));return panel;}
    const report=data.externalAdjustments;
    if(!report){panel.append(el('p','field-help','Consultando indicadores do Windows e do CS2…'));return panel;}
    const actions=el('div','button-row');
    actions.append(button('Atualizar leitura','refresh','button button-secondary',control=>action(control,async()=>{data.externalAdjustments=await api.getExternalAdjustments();render();},'Auditoria atualizada. Nenhum ajuste foi alterado.')));
    actions.append(button('Exportar relatório','download','button button-secondary',control=>action(control,()=>api.exportExternalAdjustments(),'Relatório exportado. Nenhuma configuração foi alterada.')));
    panel.append(actions);
    panel.append(el('p','audit-result',`Encontrados: ${report.summary.found} · Não encontrados: ${report.summary.notFound} · Desconhecidos: ${report.summary.unknown} · ${timeText(report.capturedAt)}`));
    for(const item of report.indicators){
      const row=el('article','external-audit-row');
      const labels={found:'Encontrado','not-found':'Não encontrado',unknown:'Desconhecido'};
      const confidence={high:'Alta',medium:'Média',low:'Baixa'};
      append(row,append(el('div','external-audit-heading'),el('strong','',item.title),el('span',`external-audit-status status-${item.status}`,labels[item.status]||labels.unknown)));
      row.append(el('p','',item.message));
      append(row,el('p','field-help',`Confiança ${confidence[item.confidence]||'baixa'} · Fonte: ${item.source?.label||'critério interno documentado'}`));
      if(item.evidence!==null&&item.evidence!==undefined){const evidence=el('details','external-audit-evidence');evidence.append(el('summary','','Ver valores observados'),el('pre','',JSON.stringify(item.evidence,null,2)));row.append(evidence);}
      if(item.limitation)row.append(el('p','field-help',item.limitation));
      panel.append(row);
    }
    for(const warning of report.warnings||[])panel.append(el('p','field-help','Leitura parcial: '+warning));
    const limits=el('details','audit-limits');limits.append(el('summary','','Limites desta auditoria'));for(const limit of report.limits||[])limits.append(el('p','field-help',limit));panel.append(limits);return panel;
  }

  function renderPerformanceAudit(){
    const panel=el('section','panel content-card optimizer-panel performance-audit');
    append(panel,el('h2','','Diagnóstico Antes/Depois'),el('p','settings-description','Guarde uma referência com o CS2 fechado, faça seus ajustes e confira quais opções consultadas mudaram. A leitura não aplica otimizações nem mede FPS.'));
    loadPage('performanceAudit','getPerformanceAudit');
    if(dataErrors.performanceAudit){append(panel,errorBox(dataErrors.performanceAudit),pageRefresh('performanceAudit','getPerformanceAudit'));return panel;}
    const info=data.performanceAudit;if(!info){panel.append(el('p','field-help','Consultando referências locais…'));return panel;}
    const label=el('input','native-select');label.maxLength=80;label.value='Antes dos ajustes';label.setAttribute('aria-label','Nome da referência de desempenho');
    const capture=button(info.reference?'Guardar nova referência':'Guardar referência Antes','save','button button-secondary',control=>action(control,async()=>{data.performanceAudit=await api.capturePerformanceReference({label:label.value});render();},'Referência guardada. Faça os ajustes e depois confira as diferenças.'));
    const compare=button('Conferir alterações Depois','check','button button-primary',control=>action(control,async()=>{data.performanceAudit=await api.comparePerformanceReference();render();},'Consulta concluída. As diferenças não identificam qual programa as causou.'));compare.disabled=!info.reference;
    const exportButton=button('Exportar diagnóstico','download','button button-secondary',control=>action(control,()=>api.exportPerformanceAudit(),'Relatório HTML exportado.'));exportButton.disabled=!info.comparison;
    append(panel,append(el('div','button-row'),label,capture,compare,exportButton));
    if(info.reference)append(panel,details([['Referência',info.reference.label],['Leitura Antes',timeText(info.reference.capturedAt)],['Áreas consultadas',`${info.reference.availableSections} de ${info.reference.totalSections}`]]),el('p','field-help','Guardar nova referência seleciona um novo ponto de partida; os arquivos anteriores permanecem guardados.'));
    if(info.comparison){const report=info.comparison;append(panel,el('p','audit-result',`${report.changes.length} diferenças conhecidas · ${report.unknown.length} itens sem comparação · leitura Depois: ${timeText(report.afterAt)}`));
      const table=el('table','optimization-table audit-table'),head=el('tr');for(const title of ['Área / opção','Antes','Depois'])head.append(el('th','',title));table.append(append(el('thead'),head));const body=el('tbody');
      const value=input=>input===null?'Não informado':typeof input==='object'?JSON.stringify(input):String(input);
      for(const item of report.changes)body.append(append(el('tr'),el('td','',`${item.sectionLabel} · ${item.label}`),el('td','',item.missingBefore?'Ausente na consulta':value(item.before)),el('td','',item.missingAfter?'Ausente na consulta':value(item.after))));
      table.append(body);if(report.changes.length)panel.append(table);
      for(const warning of report.warnings)panel.append(el('p','field-help',warning));
      if(report.unknown.length){const unknown=el('details','audit-limits');unknown.append(el('summary','',`Itens sem comparação (${report.unknown.length})`));for(const item of report.unknown)unknown.append(el('p','field-help',item.label+': indisponível antes ou depois'));panel.append(unknown);}
    }
    const limits=el('details','audit-limits');limits.append(el('summary','','O que este diagnóstico consegue comparar'));for(const limit of info.limits)limits.append(el('p','field-help',limit));panel.append(limits);return panel;
  }

  function renderChangeHistory(){
    const panel=el('section','panel content-card change-history-panel');append(panel,el('h2','','Histórico de ajustes'),el('p','settings-description','Veja o que o CSBOOST alterou, por que fez a mudança e se a restauração foi confirmada. O histórico é local e limitado aos 200 eventos mais recentes.'));
    loadPage('changeHistory','getChangeHistory');
    if(dataErrors.changeHistory){append(panel,errorBox(dataErrors.changeHistory),pageRefresh('changeHistory','getChangeHistory'));return panel;}
    const history=data.changeHistory;
    const controls=el('div','button-row');append(controls,pageRefresh('changeHistory','getChangeHistory'),button('Exportar histórico JSON','download','button button-secondary',control=>action(control,()=>api.exportChangeHistory(),'Histórico exportado sem identificador da conta Steam.')));panel.append(controls);
    if(!history){panel.append(el('p','empty-state','Carregando alterações registradas…'));return panel;}
    const events=history.events||[];panel.append(el('p','audit-result',`${events.length} registro(s) · ${history.personalDataIncluded===false?'sem identificador da conta Steam':'dados pessoais não conferidos'} · atualizado ${timeText(history.capturedAt)}`));
    if(!events.length){panel.append(el('p','empty-state','Ainda não há alterações registradas pelo CSBOOST.'));return panel;}
    const list=el('div','change-history-list');const statuses={pending:'Pendente',restored:'Restaurado',partial:'Parcial',preserved:'Preservado',discarded:'Descartado',failed:'Falhou','not-applicable':'Não se aplica'};
    for(const item of events){const row=el('article','change-history-entry');append(row,append(el('div','change-history-heading'),el('strong','',item.module),el('time','',timeText(item.at))),el('h3','',item.label));
      const values=el('dl','change-history-values');for(const [label,value]of [['Antes',item.previous],['Aplicado',item.applied],['Restauração',statuses[item.restoration]||'Não informada']])append(values,el('dt','',label),el('dd','',value));row.append(values,el('p','field-help change-history-reason',item.reason));if(item.restoredAt)row.append(el('p','field-help','Última atualização: '+timeText(item.restoredAt)));list.append(row);}
    panel.append(list,el('p','field-help','O histórico não mede ganho de FPS. Itens que dependem de confirmação externa permanecem pendentes ou preservados; o CSBOOST não registra o Steam ID no arquivo exportado.'));return panel;
  }

  function renderMemoryTuning(){
    const panel=el('section','panel content-card memory-tuning');append(panel,el('h2','','Memória · XMP / EXPO'),el('p','settings-description','Guarde a configuração deste PC antes de ajustar a BIOS. Depois, confira o que mudou e compare FPS e 1% low no benchmark.'));
    loadPage('memoryTuning','getMemoryTuning');const info=data.memoryTuning;
    if(dataErrors.memoryTuning){append(panel,errorBox(dataErrors.memoryTuning),pageRefresh('memoryTuning','getMemoryTuning'));return panel;}
    if(!info){panel.append(el('p','empty-state','Lendo módulos e configuração de memória…'));return panel;}
    if(!info.available){append(panel,note(info.reason,true),pageRefresh('memoryTuning','getMemoryTuning'));return panel;}
    const clocks=values=>(values||[]).map(value=>value===null?'Não informada':numberText(value)+' MHz').join(' / ');
    panel.append(details([['Memória física',`${numberText(info.totalGB)} GB · ${info.moduleCount} módulos`],['Frequência configurada (SMBIOS)',clocks(info.configuredClocksMHz)],['XMP / EXPO atual','Não lido do firmware'],['Placa e BIOS',`${info.board.product} · ${info.bios}`]]));
    append(panel,el('p','field-help',info.message),el('p','field-help',info.reason));
    for(const [index,item]of info.modules.slice(0,32).entries())panel.append(el('p','field-help',`Módulo ${index+1}: ${item.type} · ${numberText(item.capacityBytes/2**30)} GB · ${clocks([item.configuredClockMHz])} · modelo ${item.partNumber||'não informado'}.`));
    for(const warning of info.warnings||[])panel.append(el('p','field-help',warning));
    const steps=el('ol','hardware-steps');for(const line of ['Guarde a referência abaixo e faça uma medição antes de alterar o hardware.',`Consulte o manual da revisão da placa. ${info.guide.location}`,`Se o kit e a placa oferecerem ${info.guide.profileLabel}, use o perfil indicado pelo fabricante. Anote os valores anteriores e ajuste um recurso por vez.`,`Após reiniciar, volte ao CSBOOST, confira o hardware e repita o benchmark nas mesmas condições. Para desfazer PBO/CO ou memória, restaure os valores anteriores na BIOS ou no Ryzen Master.`])steps.append(el('li','field-help',line));panel.append(steps);
    const actions=el('div','button-row');append(actions,button(info.reference?'Guardar nova referência':'Guardar referência antes do ajuste','save','button button-primary',control=>action(control,async()=>{await api.captureHardwareReference();await refreshPart('memoryTuning','getMemoryTuning');},'Referência salva neste PC. As referências anteriores continuam guardadas.')),button('Guia oficial da placa / memória','external','button button-secondary',control=>action(control,()=>api.openMemoryGuide())),button('Salvar guia para a BIOS','download','button button-secondary',control=>action(control,()=>api.exportHardwareGuide(),result=>result.canceled?'Exportação cancelada.':'Guia de memória e PBO/CO salvo.')),pageRefresh('memoryTuning','getMemoryTuning'));panel.append(actions);
    if(info.referenceError)panel.append(note(info.referenceError,true));
    if(info.reference){append(panel,el('h3','','Referência salva'),el('p','field-help',`${new Date(info.reference.capturedAt).toLocaleString('pt-BR')} · ${clocks(info.reference.memory.configuredClocksMHz)} · BIOS ${info.reference.memory.bios}`),button('Conferir após ajuste','refresh','button button-secondary',control=>action(control,async()=>{await api.checkHardwareReference();await refreshPart('memoryTuning','getMemoryTuning');delete data.engine;},'Hardware conferido. Veja as diferenças e valide o resultado no benchmark.')));}
    const check=info.verification;if(check){
      append(panel,el('h3','','Conferência antes e depois'),el('p','field-help',new Date(check.checkedAt).toLocaleString('pt-BR')));
      const format=value=>Array.isArray(value)?value.map(item=>item===null?'Não informado':typeof item==='object'?JSON.stringify(item):String(item)).join(' / '):typeof value==='object'?JSON.stringify(value):String(value);
      for(const change of check.comparison.changes)panel.append(el('p','field-help',`${change.label}: ${format(change.before)} → ${format(change.after)}.`));
      if(!check.comparison.changes.length)panel.append(el('p','field-help','Nenhuma diferença nas propriedades lidas. Isso não confirma nem descarta uma mudança de PBO/CO ou de perfil da memória.'));
      const whea=check.stability;panel.append(el('p','field-help',whea.available?`${whea.count} novos eventos WHEA desde a referência. Ausência de eventos não certifica estabilidade.${whea.truncated?' Consulta incompleta; veja o registro do Windows.':''}`:whea.message||'Leitura WHEA indisponível.'));
      for(const warning of [...check.comparison.warnings,...(whea.warnings||[])])panel.append(el('p','field-help',warning));
    }
    panel.append(button('Medir FPS antes e depois','monitor','button button-quiet',()=>navigate('benchmark')));return panel;
  }
  function renderEngineAssessment(){
    const panel=el('section','panel content-card optimizer-panel engine-assessment');append(panel,el('h2','','Motor de otimização para este PC'),el('p','settings-description','O motor verifica sistema, GPU, número de processadores lógicos e instalação do CS2. Ajustes já aplicados ou indisponíveis ficam identificados.'));
    loadPage('engine','getEngineAssessment');if(dataErrors.engine){append(panel,errorBox(dataErrors.engine),pageRefresh('engine','getEngineAssessment'));return panel;}
    const assessment=data.engine;if(!assessment){panel.append(el('p','empty-state','Avaliando compatibilidade deste computador…'));return panel;}
    append(panel,details([['GPU detectada',assessment.hardware.gpuVendor],['Processadores lógicos',String(assessment.hardware.cores)],['RAM instalada',`${numberText(assessment.hardware.ramGB)} GB`],['Diferenças no preset gráfico',assessment.opportunities.video===null?'Indisponível':String(assessment.opportunities.video)]]));
    for(const item of assessment.hardware.capabilities)panel.append(append(el('div','engine-capability'),el('strong',item.available?'success-text':'muted-text',(item.available?'Disponível · ':'Pendente · ')+item.name),el('p','field-help',item.reason)));
    for(const warning of [...assessment.hardware.warnings,...assessment.errors])panel.append(el('p','field-help',warning));
    panel.append(pageRefresh('engine','getEngineAssessment'));return panel;
  }
  async function refreshNvidia(){
    const request=++nvidiaRequest;pageLoading.add('nvidia');delete dataErrors.nvidia;
    try{const next=await api.getNvidiaProfile({preset:nvidiaPreset});if(request===nvidiaRequest)data.nvidia=next;}catch(error){if(request===nvidiaRequest)dataErrors.nvidia=error;}finally{if(request===nvidiaRequest){pageLoading.delete('nvidia');render();}}
  }
  function renderNvidiaProfile(){
    const panel=el('section','panel content-card optimizer-panel nvidia-panel');append(panel,el('h2','','Perfil NVIDIA do CS2'),el('p','settings-description','Ajustes do driver por jogo, com prévia e recuperação dos valores anteriores. O efeito precisa ser medido no seu PC.'));
    if(!data.nvidia&&!dataErrors.nvidia&&!pageLoading.has('nvidia'))refreshNvidia();
    const select=el('select','native-select');select.setAttribute('aria-label','Preset NVIDIA');for(const [value,label]of [['recommended','Recomendado para CS2 · desempenho e latência'],['performance','Desempenho · energia e taxa de atualização'],['competitive','Competitivo · VSync e filtragem'],['texture','Filtragem extra · opcional']]){const option=el('option','',label);option.value=value;select.append(option);}select.value=nvidiaPreset;select.addEventListener('change',()=>{nvidiaPreset=select.value;delete data.nvidia;refreshNvidia();});append(panel,append(el('div','button-row'),select,button('Atualizar NVIDIA','refresh','button button-secondary',()=>{delete data.nvidia;refreshNvidia();})));
    if(pageLoading.has('nvidia')){panel.append(el('p','empty-state','Consultando o driver NVIDIA…'));return panel;}
    if(dataErrors.nvidia){panel.append(errorBox(dataErrors.nvidia));return panel;}
    const info=data.nvidia;if(!info)return panel;if(!info.supported){panel.append(el('p','settings-description',info.reason||'Driver NVIDIA compatível não encontrado.'));return panel;}
    const preview=info.preview;append(panel,el('p','field-help',`Perfil: ${preview.profileName}. Executáveis associados: ${preview.applications.join(', ')}.`));
    if(info.reason)panel.append(note(info.reason,true));
    for(const change of preview.changes)panel.append(append(el('div','engine-capability'),el('strong','',change.label),el('p','field-help',change.reason),el('p','field-help',change.tradeoff)));
    if(!preview.changes.length)panel.append(el('p','success-text','As opções reconhecidas já correspondem a este preset.'));
    if(preview.unavailable.length)panel.append(el('p','field-help','Ajustes não disponíveis no driver: '+preview.unavailable.map(item=>item.label).join(', ')+'.'));
    if(info.pendingRestore)panel.append(button('Restaurar perfil NVIDIA','refresh','button button-secondary',control=>action(control,async()=>{const result=await api.restoreNvidiaProfile();await refreshNvidia();delete data.engine;return result;},result=>result?.canceled?'Nenhuma alteração foi feita.':result?.discarded?'Backup descartado; os valores atuais foram mantidos.':result?.pendingRestore?'Ajustes sem conflito restaurados. Os valores divergentes e o backup continuam guardados.':'Perfil NVIDIA anterior restaurado.')));
    else {const apply=button('Aplicar perfil NVIDIA','bolt','button button-primary',control=>action(control,async()=>{await api.applyNvidiaProfile({preset:nvidiaPreset,previewFingerprint:preview.fingerprint});await refreshNvidia();delete data.engine;},'Ajustes do perfil NVIDIA gravados e conferidos.'));apply.disabled=!info.canApply||!preview.changes.length;panel.append(apply);}
    const displayGuide=el('details','nvidia-display-guide');append(displayGuide,el('summary','','Monitor, cor e G-SYNC'));
    append(displayGuide,
      el('p','field-help','Imagem 3D: use as configurações avançadas em 3D. O perfil do CSBOOST fica restrito ao CS2; não muda o perfil global.'),
      el('p','field-help','Resolução e frequência: escolha a resolução nativa do monitor e a maior taxa estável disponível. O perfil recomenda a maior taxa que o driver reconhecer.'),
      el('p','field-help','Escala: tela inteira pela GPU pode esticar resoluções 4:3. Marque a substituição de escala somente se precisar; a proporção da imagem pode mudar.'),
      el('p','field-help','Digital Vibrance e profundidade de cor são preferências visuais, sem ganho de FPS. Ajuste a saturação ao seu gosto e use 32 bits/8 bpc quando o monitor oferecer.'),
      el('p','field-help','G-SYNC: habilite somente se o monitor aparecer como compatível. Se usar Reflex no CS2, prefira Reflex ativado no jogo; ele pode assumir o controle da fila de renderização do driver.'),
      append(el('div','button-row'),button('Abrir Painel NVIDIA','monitor','button button-secondary',control=>action(control,()=>api.openNvidiaControlPanel(),'Painel NVIDIA aberto.')),button('Abrir configurações de tela','monitor','button button-quiet',control=>action(control,()=>api.openDisplaySettings(),'Configurações de tela abertas.'))));
    panel.append(displayGuide);
    return panel;
  }
  function renderProcessPolicy(){
    const section=el('details','process-policy');append(section,el('summary','','Configurações avançadas da sessão'),el('h3','','CPU e processos'));const automatic=el('input');automatic.type='checkbox';automatic.checked=!!sessionProcessPolicy.automatic;automatic.setAttribute('aria-label','Otimização automática de CPU');automatic.addEventListener('change',()=>{if(automatic.checked)adaptiveOptionsDraft={...(sessionProcessPolicy.adaptiveOptions||adaptiveOptionsDraft)};sessionProcessPolicy={automatic:automatic.checked,prioritizeGame:false,backgroundApps:[],backgroundMemoryPriorityApps:[],...(automatic.checked?{adaptiveOptions:{...adaptiveOptionsDraft}}:{})};render();});section.append(append(el('label','checkbox-label'),automatic,document.createTextNode('Analisar CPU e ajustar processos automaticamente')),el('p','field-help','No automático, o CSBOOST mede a carga e reduz a prioridade apenas de tarefas de fundo sob pressão sustentada. Pode incluir navegadores e sincronização do OneDrive, Dropbox ou Google Drive; a sincronização pode atrasar enquanto você joga. A prioridade do jogo não é forçada e os ajustes são restaurados ao encerrar. Discord, OBS, Teams, áudio e serviços do Windows ficam fora do equilíbrio automático.'));
    const adaptiveOptions=sessionProcessPolicy.adaptiveOptions||adaptiveOptionsDraft,adaptiveControls=el('div','process-adaptive-controls');
    adaptiveControls.append(el('strong','','Proteção contra oscilações'),el('p','field-help','Limita alternâncias de prioridade por aplicativo durante uma sessão. Estes limites são configuráveis e não representam um ajuste ideal de desempenho.'));
    const adaptiveChoices=[
      ['maxReductionsPerProcess','Máximo por processo',[[2,'2 reduções'],[3,'3 reduções'],[4,'4 reduções']]],
      ['reapplicationWindowMs','Janela de contagem',[[300000,'5 minutos'],[600000,'10 minutos'],[900000,'15 minutos']]],
      ['backoffBaseMs','Recuo inicial após restaurar',[[15000,'15 segundos'],[30000,'30 segundos'],[60000,'60 segundos']]]
    ];
    for(const [id,label,values]of adaptiveChoices){const field=el('label','adaptive-option'),caption=el('span','',label),select=el('select','native-select');select.setAttribute('aria-label',label);for(const [value,text]of values){const option=el('option','',text);option.value=String(value);select.append(option);}select.value=String(adaptiveOptions[id]??defaultAdaptiveOptions[id]);select.disabled=!sessionProcessPolicy.automatic;select.addEventListener('change',()=>{adaptiveOptionsDraft={...(sessionProcessPolicy.adaptiveOptions||adaptiveOptionsDraft),[id]:Number(select.value)};sessionProcessPolicy.adaptiveOptions={...adaptiveOptionsDraft};});field.append(caption,select);adaptiveControls.append(field);}
    section.append(adaptiveControls);
    const contexts=el('div','button-row');
    for(const [id,label] of [['competitive','Jogar'],['streaming','Transmitir'],['work','Sem ajustes de processos']])contexts.append(button(label,'cpu','button button-secondary',()=>{sessionProcessPolicy=id==='competitive'?{automatic:true,prioritizeGame:false,backgroundApps:[],backgroundMemoryPriorityApps:[],adaptiveOptions:{...adaptiveOptionsDraft}}:id==='streaming'?{automatic:false,prioritizeGame:false,backgroundApps:(data.engine?.processes?.available||[]).filter(app=>['chrome','msedge','firefox','brave','opera','vivaldi','OneDrive'].includes(app.id)).map(app=>app.id),backgroundMemoryPriorityApps:[]}:{automatic:false,prioritizeGame:false,backgroundApps:[],backgroundMemoryPriorityApps:[]};render();}));
    section.append(contexts,el('p','field-help','Jogar usa o equilíbrio automático. Transmitir reduz a prioridade de navegadores e OneDrive ativos e preserva OBS, Discord e o jogo. A escolha vale para a próxima sessão e pode ser personalizada abaixo.'));
    const capability=data.engine?.hardware.capabilities.find(item=>item.name==='Prioridade do CS2 e apps selecionados');
    const prioritize=el('input');prioritize.type='checkbox';prioritize.checked=sessionProcessPolicy.prioritizeGame;prioritize.disabled=!!sessionProcessPolicy.automatic||!capability?.available;prioritize.setAttribute('aria-label','Priorizar CPU do CS2');prioritize.addEventListener('change',()=>{sessionProcessPolicy.prioritizeGame=prioritize.checked;});section.append(append(el('label','checkbox-label'),prioritize,document.createTextNode('CS2: prioridade Acima do normal (manual)')));
    const distribution=data.engine?.cpuDistribution,affinity=el('input');affinity.type='checkbox';affinity.checked=!!sessionProcessPolicy.cpuDistribution;affinity.disabled=!!sessionProcessPolicy.automatic||!distribution?.supported;affinity.setAttribute('aria-label','Distribuir núcleos de CPU');affinity.addEventListener('change',()=>{sessionProcessPolicy.cpuDistribution=affinity.checked;});append(section,append(el('label','checkbox-label'),affinity,document.createTextNode('Separar um núcleo físico para aplicativos selecionados (experimental)')),el('p','field-help',distribution?.supported?`${distribution.gameCores} de ${distribution.physicalCores} núcleos físicos ficam para o CS2. Essa restrição pode reduzir FPS; compare antes e depois.`:distribution?.reason||'Aguardando a detecção de topologia.'));
    if(data.engine?.processError)section.append(errorBox(data.engine.processError));
    for(const warning of data.engine?.processes?.warnings||[])section.append(el('p','field-help',warning));
    section.append(el('p','field-help','A prioridade de memória é experimental e só vale durante a sessão. O Windows libera primeiro páginas com prioridade baixa sob pressão, o que pode causar recargas quando o app voltar a ser usado. Use apenas em aplicativos de fundo; o ajuste não promete FPS. Feche manualmente apps que não vai usar: o CSBOOST não encerra programas.'));
    const choices=el('div','process-choices');function addChoice(row,app,field,label){const input=el('input');input.type='checkbox';input.checked=(sessionProcessPolicy[field]||[]).includes(app.id);input.disabled=!!sessionProcessPolicy.automatic||!capability?.available;input.setAttribute('aria-label',label+' '+app.name);input.addEventListener('change',()=>{sessionProcessPolicy[field]=(sessionProcessPolicy[field]||[]).filter(id=>id!==app.id);if(input.checked)sessionProcessPolicy[field].push(app.id);});row.append(append(el('label','checkbox-label'),input,document.createTextNode(label)));}
    for(const app of data.engine?.processes?.available||[]){const row=el('div','process-choice');row.append(el('strong','',`${app.name} (${app.instances} ativos · ${Number.isFinite(app.memoryMB)?Math.round(app.memoryMB)+' MB':'memória desconhecida'})`));const options=el('div','process-choice-options');addChoice(options,app,'backgroundApps','Prioridade abaixo do normal');addChoice(options,app,'backgroundMemoryPriorityApps','Memória baixa');row.append(options);if(app.note)row.append(el('p','field-help',app.note));choices.append(row);}section.append(choices);return section;
  }

  function promptUser({ title, description, value = '', submit = 'Salvar', danger = false, textInput = true }) {
    const dialog = document.getElementById('prompt-dialog');
    const form = document.getElementById('prompt-form');
    const field = document.getElementById('dialog-field');
    const label = document.getElementById('dialog-field-label');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-description').textContent = description;
    document.getElementById('dialog-icon').replaceChildren(icon(danger ? 'trash' : 'file'));
    const submitButton = document.getElementById('dialog-submit');
    submitButton.textContent = submit;
    submitButton.className = `button ${danger ? 'button-danger' : 'button-primary'}`;
    field.value = value;
    field.hidden = !textInput;
    label.hidden = !textInput;
    field.required = textInput;
    dialog.showModal();
    if (textInput) { field.focus(); field.select(); }
    return new Promise(resolve => {
      let answer = null;
      function submitted(event) {
        event.preventDefault();
        if (textInput && !field.value.trim()) { field.setCustomValidity('Digite um nome para o perfil.'); field.reportValidity(); return; }
        answer = textInput ? field.value.trim() : true;
        dialog.close();
      }
      const cancel = () => dialog.close();
      const clearValidity = () => field.setCustomValidity('');
      function closed() {
        form.removeEventListener('submit', submitted);
        field.removeEventListener('input', clearValidity);
        document.getElementById('dialog-cancel').removeEventListener('click', cancel);
        resolve(answer);
      }
      form.addEventListener('submit', submitted);
      field.addEventListener('input', clearValidity);
      document.getElementById('dialog-cancel').addEventListener('click', cancel);
      dialog.addEventListener('close', closed, { once: true });
    });
  }

  async function reloadProfiles(id) {
    data.profiles = await api.listProfiles();
    delete dataErrors.profiles;
    selectedProfileId = id || data.profiles[0]?.id || null;
    draft = mergeSettings(selectedProfile()?.settings);
    dirty = false;
    render();
  }

  async function createProfile(control) {
    const name = await promptUser({ title: 'Novo perfil', description: 'Dê um nome à configuração que você quer guardar.', value: '', submit: 'Criar perfil' });
    if (!name) return;
    await action(control, async () => {
      const saved = await api.saveProfile({ name, settings: defaults() });
      await reloadProfiles(saved.id);
    }, 'Perfil criado. Ajuste as configurações e salve quando estiver pronto.');
  }

  async function saveProfile(control) {
    const profile = selectedProfile();
    let name = profile?.name;
    if (!name) name = await promptUser({ title: 'Salvar configuração', description: 'Seu perfil fica salvo neste computador e pode ser exportado.', value: 'Meu perfil', submit: 'Salvar perfil' });
    if (!name) return;
    await action(control, async () => {
      const saved = await api.saveProfile({ ...(profile ? { id: profile.id } : {}), name, settings: clone(draft) });
      await reloadProfiles(saved.id);
    }, 'Perfil salvo neste computador.');
  }

  async function renameProfile(control) {
    const profile = selectedProfile();
    if (!profile) return;
    const name = await promptUser({ title: 'Renomear perfil', description: 'As configurações do perfil serão preservadas.', value: profile.name, submit: 'Renomear' });
    if (!name || name === profile.name) return;
    await action(control, async () => { await api.saveProfile({ id: profile.id, name, settings: profile.settings }); await reloadProfiles(profile.id); }, 'Perfil renomeado.');
  }

  async function removeProfile(control) {
    const profile = selectedProfile();
    if (!profile) return;
    const accepted = await promptUser({ title: 'Excluir este perfil?', description: `“${profile.name}” será removido dos perfis salvos. O arquivo já aplicado no CS2 será preservado.`, submit: 'Excluir perfil', danger: true, textInput: false });
    if (!accepted) return;
    await action(control, async () => { await api.deleteProfile(profile.id); await reloadProfiles(null); }, 'Perfil excluído.');
  }

  function setSetting(path, value) {
    if(path==='crosshair'||path.startsWith('crosshair.')){crosshairCodeExport=null;document.querySelector('.code-export-result')?.remove();}
    if (path.includes('.')) {const [group,key]=path.split('.');draft[group][key]=value;}
    else draft[path] = value;
    for(const input of document.querySelectorAll('[data-setting]'))if(input.dataset.setting===path)input.value=value;
    dirty = true;
    const marker = document.getElementById('unsaved-marker');
    if (marker) marker.hidden = false;
    const apply = document.getElementById('apply-profile');
    if (apply) { apply.disabled = true; apply.title = 'Salve as alterações antes de aplicar.'; }
    updateCrosshair();
    for(const preview of document.querySelectorAll('.game-preview'))preview.updatePreview?.();
  }

  function rangeField({ label, path, min, max, step, help }) {
    const wrapper = el('div', 'field');
    const id = `setting-${path.replace('.', '-')}`;
    const labelNode = el('label', '', label);
    labelNode.htmlFor = id;
    const value = path.includes('.') ? draft[path.split('.')[0]][path.split('.')[1]] : draft[path];
    const range = el('input');
    range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = value; range.id = id;
    const numeric = el('input');
    numeric.type = 'number'; numeric.min = min; numeric.max = max; numeric.step = step; numeric.value = value;
    numeric.id=id+'-value';
    numeric.setAttribute('aria-label', `${label}, valor exato`);
    range.dataset.setting=path;numeric.dataset.setting=path;
    range.addEventListener('input', () => { numeric.value = range.value; setSetting(path, Number(range.value)); });
    numeric.addEventListener('input', () => {
      if (numeric.value === '' || !numeric.checkValidity()) return;
      range.value = numeric.value; setSetting(path, Number(numeric.value));
    });
    numeric.addEventListener('change', () => {
      let next = Number(numeric.value);
      if (!Number.isFinite(next) || numeric.value === '') next = Number(range.value);
      next = Math.max(min, Math.min(max, next));
      const precision = String(step).includes('.') ? String(step).split('.')[1].length : 0;
      next = Number(next.toFixed(precision));
      numeric.value = next; range.value = next; setSetting(path, next);
    });
    append(wrapper, labelNode, append(el('div', 'field-row'), range, numeric), help && el('p', 'field-help', help));
    return wrapper;
  }

  function editorSection(iconName, title, ...contents) {
    return append(el('section', 'editor-section'), append(el('div', 'editor-section-heading'), icon(iconName), el('h3', '', title)), ...contents);
  }
  function gamePreview(kind){return window.CSBoostPreview.create({kind,el,append,button,getSettings:()=>draft,setSetting,drawCrosshair:updateCrosshair});}
  function selectSetting(label,path,options){const field=el('div','field'),labelNode=el('label','',label),select=el('select','native-select');select.id='setting-'+path.replace('.','-');labelNode.htmlFor=select.id;const [group,key]=path.split('.');options.forEach(([value,text])=>{const option=el('option','',text);option.value=value;option.selected=String(draft[group][key])===String(value);select.append(option);});select.addEventListener('change',()=>setSetting(path,select.value));return append(field,labelNode,select);}
  function checkSetting(label,path){const [group,key]=path.split('.');const input=el('input');input.type='checkbox';input.checked=draft[group][key];input.addEventListener('change',()=>setSetting(path,input.checked));return append(el('label','checkbox-label'),input,document.createTextNode(label));}

  function renderDisplayModes(){
    const box=el('div','display-modes');append(box,el('h3','','Modos reais do monitor'),el('p','field-help','Escolha uma resolução e taxa informadas pelo Windows. Selecionar o monitor consulta seus modos; confirme dentro do CS2 em qual monitor o jogo abriu.'));
    loadPage('displays','getDisplays');const info=data.displays;
    if(dataErrors.displays){box.append(errorBox(dataErrors.displays));return box;}if(!info){box.append(el('p','field-help','Consultando monitores…'));return box;}if(!info.supported){box.append(el('p','field-help',info.reason));return box;}
    const monitor=el('select','native-select'),mode=el('select','native-select');monitor.setAttribute('aria-label','Monitor consultado');mode.setAttribute('aria-label','Modo de resolução compatível');
    for(const display of info.displays){const option=el('option','',`${display.primary?'Principal · ':''}${display.monitorName||display.id} · ${display.current.width}×${display.current.height} @ ${display.current.refreshHz??'?'} Hz`);option.value=display.id;monitor.append(option);}if(!info.displays.some(item=>item.id===displayId))displayId=info.displays[0].id;monitor.value=displayId;
    const modes=info.displays.find(item=>item.id===displayId).modes.filter(item=>item.selectable);
    for(const [index,item]of modes.entries()){const option=el('option','',`${item.width} × ${item.height} · ${item.refreshHz??'Automático'} Hz`);option.value=index;option.selected=item.width===draft.video.width&&item.height===draft.video.height&&item.refreshHz===draft.video.refreshHz;mode.append(option);}
    monitor.addEventListener('change',()=>{displayId=monitor.value;render();});
    const choose=button('Usar modo no perfil','check','button button-secondary',control=>action(control,async()=>{const item=modes[Number(mode.value)];if(!item)throw Error('Selecione um modo listado.');const result=await api.resolveDisplayMode({displayId,width:item.width,height:item.height,...(item.refreshHz?{refreshHz:item.refreshHz}:{}),previewFingerprint:info.fingerprint});draft.video={...draft.video,...result.profileVideo};dirty=true;render();},'Modo colocado no perfil. Salve e aplique antes de iniciar o jogo.'));choose.disabled=!modes.length;
    append(box,append(el('div','button-row'),monitor,mode,choose,pageRefresh('displays','getDisplays')),el('p','field-help',info.message));return box;
  }
  function renderProfileVideo(profile){
    const box=el('section','profile-video panel content-card');append(box,el('h3','','Vídeo avançado do perfil'),el('p','field-help','Os valores abaixo ficam salvos no perfil. Aplicar a config de comandos não grava estas opções; confira e aplique o vídeo separadamente com o CS2 fechado. Podem aumentar a qualidade e reduzir FPS.'));
    const graphics=profile.settings.graphics;box.append(el('p','field-help',`${Object.keys(graphics).length} opções gráficas salvas. A prévia mostra valores atuais e desejados.`));
    box.append(button('Conferir vídeo do perfil','monitor','button button-secondary',control=>action(control,async()=>{const result=await api.previewProfileVideo(profile.id);data.profileVideo={...result,id:profile.id};render();})));
    const plan=data.profileVideo;if(plan?.id===profile.id){if(plan.changes.length)box.append(details(plan.changes.map(row=>[row.label,row.before+' → '+row.after])));else box.append(el('p','field-help','Os valores reconhecidos já correspondem ao perfil.'));if(plan.unsupported.length)box.append(note('Opções ausentes preservadas: '+plan.unsupported.join(', '),true));
      const apply=button('Aplicar vídeo do perfil','bolt','button button-primary',control=>action(control,async()=>{await api.applyProfileVideo({id:profile.id,sourceSHA256:plan.sourceSHA256,profileFingerprint:plan.profileFingerprint});delete data.profileVideo;delete data.optimization;delete data.boostPlan;render();},'Vídeo do perfil aplicado; backup disponível para restaurar.'));apply.disabled=plan.running||!!plan.active||!plan.changes.length;
      box.append(apply);if(plan.active)box.append(button('Restaurar vídeo anterior do perfil','refresh','button button-secondary',control=>action(control,async()=>{await api.restoreOptimization();delete data.profileVideo;delete data.optimization;delete data.boostPlan;render();},'Vídeo anterior restaurado.')));
    }return box;
  }
  function renderProfileConfigRecovery(){
    const box=el('div','config-recovery');loadPage('profileConfig','getProfileConfigState');const info=data.profileConfig;
    if(dataErrors.profileConfig){box.append(errorBox(dataErrors.profileConfig));return box;}if(!info)return box;
    if(info.pendingRestore){append(box,el('h3','','Cópia anterior do csboost.cfg'),el('p','field-help',info.reason||'O arquivo anterior está guardado. A restauração preserva alterações externas.'),button('Restaurar cfg anterior','refresh','button button-secondary',control=>action(control,async()=>{await api.restoreProfileConfig();await refreshPart('profileConfig','getProfileConfigState');},'Arquivo anterior restaurado; backups continuam guardados.')));}
    return box;
  }

  function updateCrosshair(graphic=document.getElementById('crosshair-graphic'),settings=draft.crosshair,renderHeight) {
    if (!graphic) return;
    const bounds=graphic.closest('.preview-scene')?.getBoundingClientRect();
    const width=bounds?.width>0?bounds.width:105,height=bounds?.height>0?bounds.height:105;
    window.CSBoostCrosshairPreview.draw(graphic,settings,{width,height,renderHeight:renderHeight??height});
  }

  function renderCrosshairCode(){
    const box=el('div','crosshair-code-transfer');append(box,el('h3','','Código de mira'),el('p','field-help','Leia um código CSGO- ou CS, confira a prévia e use no perfil. Campos adicionais ficam preservados no código de origem. Isso não altera o jogo até salvar e aplicar o perfil.'));
    const input=el('input','native-select');input.value=crosshairCodeText;input.maxLength=80;input.placeholder='CSGO-… ou CS…';input.setAttribute('aria-label','Código de mira para importar');input.addEventListener('input',()=>crosshairCodeText=input.value);
    const read=button('Ler código de mira','file','button button-secondary',control=>action(control,async()=>{const before=JSON.stringify(draft.crosshair);const result=await api.previewCrosshairCode({code:input.value,crosshair:draft.crosshair});crosshairCodePreview={...result,profileId:selectedProfileId,editorBefore:before};crosshairCodeExport=null;render();}));
    const generate=button('Gerar código da mira','download','button button-secondary',control=>action(control,async()=>{crosshairCodeExport={...await api.exportCrosshairCode(draft.crosshair),editorBefore:JSON.stringify(draft.crosshair)};render();}));generate.disabled=!draft.crosshair.shareCodeSource&&!draft.crosshair.codeParameters;generate.title=generate.disabled?'Defina os parâmetros adicionais ou importe um código primeiro.':'';
    append(box,append(el('div','button-row'),input,read,generate));
    if(crosshairCodePreview){const preview=crosshairCodePreview;append(box,el('p','field-help',`Formato reconhecido: ${preview.format}. ${preview.canImport?'Compatível com o editor.':'Valores fora do que o editor representa; importação recusada.'}`));for(const warning of preview.warnings)box.append(el('p','field-help',warning));const use=button('Usar mira no perfil','check','button button-secondary',()=>{if(preview.profileId!==selectedProfileId||preview.editorBefore!==JSON.stringify(draft.crosshair)){notify('O perfil mudou. Leia o código novamente antes de usar.',true);return;}draft.crosshair=clone(preview.crosshair);dirty=true;crosshairCodePreview=null;crosshairCodeExport=null;render();notify('Mira colocada no perfil. Confira, salve e aplique quando desejar.');});use.disabled=!preview.canImport;box.append(use);}
    if(draft.crosshair.shareCodeSource){append(box,el('p','field-help','Formato vinculado ao código. Para trocar entre pixels e medidas antigas, descarte primeiro os campos extras. Gerar um código preserva os extras; não inclui largura sniper e opções fora desse formato.'),button('Descartar campos extras do código','trash','button button-quiet button-small',()=>{delete draft.crosshair.shareCodeSource;crosshairCodePreview=null;crosshairCodeExport=null;dirty=true;render();}));}
    else if(!draft.crosshair.codeParameters)append(box,el('p','field-help','Para gerar um código novo, defina os parâmetros dinâmicos adicionais. Começam com valores próprios do CSBOOST; confira antes de salvar/aplicar.'),button('Definir parâmetros adicionais','plus','button button-secondary button-small',()=>{setSetting('crosshair',{...draft.crosshair,codeParameters:{splitDistance:3,innerSplitAlpha:1,outerSplitAlpha:.5,splitSizeRatio:.5,fixedCrosshairGap:3,deployedWeaponGapEnabled:true}});render();}));
    else{
      const advanced=el('details','audit-limits');advanced.append(el('summary','','Parâmetros adicionais da mira'));
      const fields=el('div','setting-fields'),legacy=draft.crosshair.version===2;
      for(const [key,label,min,max,step]of [['splitDistance','Separação dinâmica',0,legacy?7:127,1],['innerSplitAlpha','Opacidade dinâmica interna',0,1,legacy?.1:.05],['outerSplitAlpha','Opacidade dinâmica externa',legacy?0:.3,1,legacy?.1:.05],['splitSizeRatio','Proporção dinâmica',0,1,legacy?.1:.01],...(legacy?[['fixedCrosshairGap','Espaçamento fixo',-12.8,12.7,.1]]:[])]){const field=el('div','field'),labelNode=el('label','',label),number=el('input','native-select');number.type='number';number.min=min;number.max=max;number.step=step;number.value=draft.crosshair.codeParameters[key];number.setAttribute('aria-label',label);number.addEventListener('change',()=>setSetting('crosshair',{...draft.crosshair,codeParameters:{...draft.crosshair.codeParameters,[key]:Number(number.value)}}));append(field,labelNode,number);fields.append(field);}
      if(legacy){const toggle=el('input');toggle.type='checkbox';toggle.checked=draft.crosshair.codeParameters.deployedWeaponGapEnabled;toggle.addEventListener('change',()=>setSetting('crosshair',{...draft.crosshair,codeParameters:{...draft.crosshair.codeParameters,deployedWeaponGapEnabled:toggle.checked}}));fields.append(append(el('label','checkbox-label'),toggle,document.createTextNode('Espaçamento conforme arma')));}
      append(advanced,fields,el('p','field-help','O formato do código exige incrementos específicos. Valores não representáveis são recusados, sem arredondar silenciosamente.'));box.append(advanced);
    }
    if(crosshairCodeExport&&crosshairCodeExport.editorBefore===JSON.stringify(draft.crosshair)){const output=el('textarea','native-select code-export-result');output.readOnly=true;output.value=crosshairCodeExport.code;output.rows=2;output.setAttribute('aria-label','Código de mira gerado');output.addEventListener('focus',()=>output.select());box.append(output);for(const warning of crosshairCodeExport.warnings)box.append(el('p','field-help',warning));}
    return box;
  }

  function renderConfig(page) {
    append(page, append(el('div', 'page-heading'), titleBlock('Config do CS2', 'Crie, edite e aplique perfis de configuração.', 'FEITO PARA O SEU JOGO'), button('Abrir pasta de configs', 'folder', 'button button-secondary', control => action(control, () => api.openFolder('gameCfg')))));
    const layout = el('div', 'config-layout');
    const profilesPanel = el('aside', 'panel profiles-panel');
    const newButton = button('', 'plus', 'button button-secondary button-small button-icon', createProfile);
    newButton.title = 'Criar perfil'; newButton.setAttribute('aria-label', 'Criar perfil');
    profilesPanel.append(append(el('div', 'profiles-title'), el('h2', '', 'Meus perfis'), newButton));
    if (dataErrors.profiles) profilesPanel.append(errorBox(dataErrors.profiles));
    if(state.profileHealth?.invalidCount){
      const warning=el('div','profile-health-warning');warning.append(errorBox(`${state.profileHealth.invalidCount} perfil(is) não puderam ser lidos. Os arquivos originais foram preservados; os demais perfis continuam disponíveis.`));
      const problems=el('details');problems.append(el('summary','','Conferir perfis com problema'));for(const item of state.profileHealth.issues)problems.append(el('p','field-help',`${item.id}.json · ${item.reason}`));
      append(warning,problems,button('Abrir pasta dos perfis','folder','button button-secondary button-small',control=>action(control,()=>api.openFolder('profiles'))));profilesPanel.append(warning);
    }
    if (!data.profiles.length&&!dataErrors.profiles&&!state.profileHealth?.invalidCount) profilesPanel.append(append(el('div', 'empty-state'), icon('file'), el('strong', '', 'Sua primeira config'), el('p', '', 'Ajuste os valores ao lado e salve seu primeiro perfil.')));
    else if(data.profiles.length) {
      const list = el('div', 'profiles-list');
      data.profiles.forEach(profile => {
        const profileButton = button('', null, `profile-button${profile.id === selectedProfileId ? ' active' : ''}`, async () => {
          if (profile.id === selectedProfileId) return;
          if (dirty) {
            const accepted = await promptUser({ title: 'Trocar de perfil?', description: 'As alterações que ainda não foram salvas serão descartadas.', submit: 'Trocar perfil', textInput: false });
            if (!accepted) return;
          }
          selectedProfileId = profile.id; draft = mergeSettings(profile.settings); dirty = false; render();
        });
        profileButton.title=profile.name;profileButton.setAttribute('aria-label','Perfil: '+profile.name);
        append(profileButton, configThumbnail(profile.settings,true), append(el('div','profile-summary'), el('strong', '', profile.name), el('small', '', profile.updatedAt ? `Salvo em ${new Date(profile.updatedAt).toLocaleDateString('pt-BR')}` : 'Perfil local')));
        list.append(profileButton);
      });
      profilesPanel.append(list);
    }
    profilesPanel.append(el('p', 'profiles-hint', 'Exporte JSON para usar o perfil em outro CSBOOST, ou CFG para carregar os comandos no jogo.'));
    profilesPanel.append(button('Importar arquivo','folder','button button-secondary button-small',control=>action(control,async()=>{const result=await api.importProfileFile();if(!result.canceled){await reloadProfiles(result.profile.id);notify(result.warnings?.length?`Perfil importado com ${result.warnings.length} avisos. Confira os valores.`:'Perfil importado; nenhuma alteração aplicada ao jogo.');}return result;})));
    profilesPanel.append(button('Ler minha config do CS2','refresh','button button-secondary button-small',control=>action(control,async()=>{data.gameProfile=await api.previewGameProfile();render();})));
    profilesPanel.append(button('Configs profissionais','steam','button button-secondary button-small',()=>{teamsTab='pros';navigate('teams');}));
    const editor = el('div', 'config-editor');
    const panel = el('section', 'panel');
    const profile = selectedProfile();
    const title = append(el('h2'), document.createTextNode(profile?.name || 'Minha configuração'));
    const marker = el('span', 'unsaved', 'Alterações não salvas'); marker.id = 'unsaved-marker'; marker.hidden = !dirty; title.append(marker);
    append(panel, append(el('div', 'editor-header'), append(el('div', 'editor-title'), title, el('p', '', 'Ajuste, salve e aplique quando estiver pronto.')), button('Salvar alterações', 'save', 'button button-primary', saveProfile)));
    if(profile?.provenance){const origin=profile.provenance;panel.append(el('p','pro-origin',`Origem: ${origin.playerName} · ${origin.sourceUrl} · consulta ${timeText(origin.consultedAt)} · ${origin.customized?'Personalizado após importar':'Campos profissionais selecionados; demais opções preservadas da base.'}`));}
    if(data.gameProfile){const preview=el('section','game-profile-preview');append(preview,el('h3','','Configuração lida do seu CS2'),details([['Sensibilidade',numberText(data.gameProfile.settings.sensitivity)],['Mira',data.gameProfile.settings.crosshair.version===3?'Formato atual do CS2':'Formato anterior'],['Resolução',`${data.gameProfile.settings.video.width} × ${data.gameProfile.settings.video.height}`],['Opções reconhecidas',data.gameProfile.fields.length]]),el('p','field-help',data.gameProfile.message),button('Salvar leitura como novo perfil','save','button button-secondary',control=>action(control,async()=>{const result=await api.importGameProfile({sourceFingerprint:data.gameProfile.sourceFingerprint});delete data.gameProfile;await reloadProfiles(result.profile.id);},'Configuração importada para um novo perfil; jogo preservado.')));for(const warning of data.gameProfile.warnings)preview.append(el('p','field-help',warning));panel.append(preview);}
    panel.append(editorSection('mouse', 'Jogo e controles', append(el('div', 'setting-fields'),
      rangeField({ label:'Sensibilidade do mouse', path:'sensitivity', min:.01, max:100, step:.01, help:'Valor usado pelo comando sensitivity.' }),
      rangeField({ label:'Sensibilidade com zoom', path:'zoomSensitivity', min:.01, max:100, step:.001 }),
      rangeField({ label:'Volume geral', path:'volume', min:0, max:1, step:.01, help:'0 silencia o jogo; 1 usa o volume máximo.' }),
      rangeField({ label:'Limite de FPS', path:'fpsMax', min:0, max:1000, step:1, help:'Use 0 para deixar o limite de FPS desativado.' })
    )));
    const crosshair = el('div', 'crosshair-layout');
    const controls = el('div');
    const format=el('select','native-select');format.setAttribute('aria-label','Formato da mira');for(const[value,label]of [[3,'CS2 atual: medidas em pixels'],[2,'Formato anterior: comandos clássicos']]){const option=el('option','',label);option.value=value;format.append(option);}format.value=draft.crosshair.version;format.disabled=!!draft.crosshair.shareCodeSource;format.addEventListener('change',()=>{draft.crosshair.version=Number(format.value);if(draft.crosshair.style>5&&draft.crosshair.version===2)draft.crosshair.style=4;dirty=true;crosshairCodePreview=null;crosshairCodeExport=null;render();});controls.append(format);
    const modern=draft.crosshair.version===3;
    append(controls,append(el('div','setting-fields'),rangeField({label:'Estilo da mira (índice do CS2)',path:'crosshair.style',min:0,max:modern?8:5,step:1}),rangeField({label:'Tamanho da mira',path:modern?'crosshair.lengthPixels':'crosshair.size',min:0,max:modern?255:10,step:modern?1:.1}),rangeField({label:'Espaçamento',path:modern?'crosshair.gapPixels':'crosshair.gap',min:modern?0:-10,max:modern?255:10,step:modern?1:.1}),rangeField({label:'Espessura',path:modern?'crosshair.thicknessPixels':'crosshair.thickness',min:0,max:modern?31:5,step:modern?1:.1}),rangeField({label:'Opacidade da mira',path:'crosshair.alpha',min:0,max:255,step:1})));
    if(modern)controls.append(rangeField({label:'Altura de referência da mira',path:'crosshair.screenHeight',min:0,max:16384,step:1,help:'Referência usada pelo CS2 para o tamanho da mira. Importe a configuração atual para preservar esse valor.'}));
    const colorField = el('div', 'field');
    colorField.append(el('span', 'field-label', 'Cor da mira'));
    const colorChoices = el('div', 'crosshair-color');
    const names = ['Vermelha', 'Verde', 'Amarela', 'Azul', 'Ciano', 'Personalizada'];
    names.forEach((name, color) => {
      const choice = button('', null, `color-choice${draft.crosshair.color === color ? ' active' : ''}`, () => {
        setSetting('crosshair.color', color);
        colorChoices.querySelectorAll('button').forEach((node, index) => { node.classList.toggle('active', index === color); node.setAttribute('aria-pressed', String(index === color)); });
      });
      choice.title = name; choice.setAttribute('aria-label', `Cor da mira: ${name.toLowerCase()}`); choice.setAttribute('aria-pressed', String(draft.crosshair.color === color));
      choice.append(el('span', `color-${color}`)); colorChoices.append(choice);
    });
    colorField.append(colorChoices); controls.querySelector('.setting-fields').append(colorField);
    const toggles = el('div', 'toggle-row');
    [['Ponto central','dot'],['Contorno','outline'],['Formato T','tStyle'],['Seguir recuo','followRecoil'],...(!modern?[['Usar opacidade','useAlpha']]:[])].forEach(([label, key]) => {
      const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = draft.crosshair[key];
      checkbox.setAttribute('aria-label',label);
      checkbox.addEventListener('change', () => {if(key==='outline'&&modern&&checkbox.checked&&draft.crosshair.outlineMode===0)setSetting('crosshair.outlineMode',1);setSetting(`crosshair.${key}`, checkbox.checked);});
      toggles.append(append(el('label', 'checkbox-label'), checkbox, document.createTextNode(label)));
    });
    controls.append(toggles);
    controls.append(append(el('div','setting-fields'),...['red','green','blue'].map((key,index)=>rangeField({label:['Cor: vermelho','Cor: verde','Cor: azul'][index],path:'crosshair.'+key,min:0,max:255,step:1})),rangeField({label:'Espessura da linha sniper',path:'crosshair.sniperWidth',min:0,max:10,step:1})));
    controls.append(el('p','field-help','RGB usa a opção Personalizada. A prévia é aproximada; movimento, recuo e feedback de disparo devem ser conferidos dentro do CS2.'));
    const history=el('details','crosshair-history');history.append(el('summary','','Histórico local de miras'));
    if(!profile?.crosshairHistory?.length)history.append(el('p','field-help','Ao salvar uma alteração de mira, as últimas cinco versões anteriores ficam guardadas neste perfil.'));
    for(const [index,entry]of (profile?.crosshairHistory??[]).entries()){const row=el('div','button-row');append(row,el('span','field-help',new Date(entry.savedAt).toLocaleString('pt-BR')),button('Recuperar mira '+(index+1),'refresh','button button-quiet button-small',()=>{setSetting('crosshair',clone(entry.crosshair));crosshairCodePreview=null;crosshairCodeExport=null;render();notify('Mira anterior no rascunho. Salve e aplique quando desejar.');}));history.append(row);}
    append(crosshair, controls); panel.append(editorSection('crosshair', 'Sua mira', crosshair,history,renderCrosshairCode()));
    panel.append(editorSection('monitor','Vídeo',renderDisplayModes(),append(el('div','setting-fields'),rangeField({label:'Largura da resolução',path:'video.width',min:640,max:7680,step:1}),rangeField({label:'Altura da resolução',path:'video.height',min:480,max:4320,step:1}),rangeField({label:'Taxa de atualização (Hz)',path:'video.refreshHz',min:0,max:2000,step:1,help:'0 preserva a escolha do jogo. Prefira um modo listado pelo Windows; aplicada como pedido de inicialização em tela cheia.'}),selectSetting('Modo de tela','video.mode',[['fullscreen','Tela cheia'],['borderless','Janela sem bordas'],['windowed','Janela']]))));
    panel.append(editorSection('monitor','Posição da arma',append(el('div','setting-fields'),rangeField({label:'Viewmodel FOV',path:'viewmodelFov',min:54,max:68,step:1,help:'Altera o campo de visão da arma; a cena mantém sua perspectiva.'}),rangeField({label:'Viewmodel X',path:'viewmodel.x',min:-2,max:2.5,step:.1}),rangeField({label:'Viewmodel Y',path:'viewmodel.y',min:-2,max:2,step:.1}),rangeField({label:'Viewmodel Z',path:'viewmodel.z',min:-2,max:2,step:.1}))));
    const palette=el('div','hud-color-palette');palette.setAttribute('role','group');palette.setAttribute('aria-label','Cor do HUD');
    const colors=window.CSBoostPreview.hudPalette;
    for(const [index,color]of colors.entries()){const choice=button('',null,'hud-color-choice',()=>setSetting('hud.color',index));choice.dataset.hudColor=String(index);choice.style.setProperty('--swatch',color.hex);choice.title=color.name;choice.setAttribute('aria-label','HUD: '+color.name);choice.setAttribute('aria-pressed',String(Number(draft.hud.color)===index));palette.append(choice);}
    const advancedHud=el('details','hud-color-index');append(advancedHud,el('summary','','Índice da cor'),rangeField({label:'Cor do HUD (índice do CS2)',path:'hud.color',min:0,max:12,step:1}));
    panel.append(editorSection('monitor','HUD',append(el('div','setting-fields'),rangeField({label:'Escala do HUD',path:'hud.scale',min:.5,max:1,step:.01}),append(el('div','field'),el('span','field-label','Cor do HUD'),palette,el('output','hud-color-name',colors[Number(draft.hud.color)]?.name||'')),rangeField({label:'Margem horizontal',path:'hud.safeZoneX',min:.5,max:1,step:.01}),rangeField({label:'Margem vertical',path:'hud.safeZoneY',min:.85,max:1,step:.01}),advancedHud)));

    panel.append(editorSection('crosshair','Radar',append(el('div','setting-fields'),rangeField({label:'Zoom do mapa',path:'radar.scale',min:.25,max:1,step:.01}),rangeField({label:'Tamanho no HUD',path:'radar.hudScale',min:.8,max:1.3,step:.01}),rangeField({label:'Opacidade do fundo',path:'radar.backgroundAlpha',min:0,max:1,step:.05})),append(el('div','toggle-row'),checkSetting('Sempre centralizado','radar.centered'),checkSetting('Girar com o jogador','radar.rotate'))));
    panel.append(editorSection('play','Inicialização',checkSetting('Habilitar console do desenvolvedor','launch.console'),selectSetting('Tecla para recarregar os comandos do perfil','launch.reloadKey',[['','Desativada'],...['f6','f7','f8','f9','f10','f11','f12'].map(key=>[key,key.toUpperCase()])]),el('p','field-help','Após iniciar com o perfil, a tecla escolhida executa csboost.cfg no jogo. Ela ocupa esse atalho; resolução e Hz continuam dependendo de reiniciar o jogo.')));
    const binds=el('div','binds-list');draft.binds.forEach((bind,index)=>{const row=el('div','button-row');const key=el('input','native-select');key.value=bind.key;key.maxLength=20;key.setAttribute('aria-label','Tecla do atalho');key.addEventListener('change',()=>{draft.binds[index].key=key.value.trim().toLowerCase();setSetting('binds',draft.binds);});const actionSelect=el('select','native-select');['+jump','+duck','+attack','+attack2','+reload','+use','+forward','+back','+moveleft','+moveright','+sprint','slot1','slot2','slot3','slot4','slot5','slot6','slot7','slot8','slot9','slot10','drop','lastinv','buymenu'].forEach(value=>{const option=el('option','',value);option.value=value;option.selected=value===bind.action;actionSelect.append(option);});actionSelect.setAttribute('aria-label','Comando do atalho');actionSelect.addEventListener('change',()=>{draft.binds[index].action=actionSelect.value;setSetting('binds',draft.binds);});append(row,key,actionSelect,button('Remover','trash','button button-quiet button-small',()=>{draft.binds.splice(index,1);dirty=true;render();}));binds.append(row);});
    panel.append(editorSection('mouse','Atalhos de teclado e mouse',binds,append(el('div','button-row'),button('Adicionar atalho','plus','button button-secondary button-small',()=>{if(draft.binds.length>=40){notify('Limite de 40 atalhos.',true);return;}draft.binds.push({key:'',action:'+jump'});dirty=true;render();}),button('Adicionar atalhos de granada','mouse','button button-secondary button-small',()=>{const suggestions=[{key:'mouse4',action:'slot7'},{key:'mouse5',action:'slot8'}],added=[],occupied=[];for(const suggestion of suggestions){const current=draft.binds.find(item=>item.key.toLowerCase()===suggestion.key);if(current){if(current.action!==suggestion.action)occupied.push(suggestion.key);continue;}if(draft.binds.length>=40)break;draft.binds.push(suggestion);added.push(suggestion.key);}if(added.length){dirty=true;setSetting('binds',draft.binds);}render();notify(added.length?`Atalhos adicionados: ${added.join(', ')} → flash e smoke.`:occupied.length?`Preservados: ${occupied.join(', ')} já está(ão) em uso.`:'Os atalhos recomendados já estão no perfil.',occupied.length>0||added.length===0);}))));
    const shortcuts=el('nav','editor-shortcuts');shortcuts.setAttribute('aria-label','Seções da configuração');
    const sections=[...panel.querySelectorAll('.editor-section')];
    const sharedPreview=gamePreview('unified'),controlHost=sharedPreview.querySelector('.preview-controls');
    const anchors=new Map(sections.map(section=>{const anchor=document.createComment('editor section');section.before(anchor);return [section,anchor];}));
    const selectCategory=title=>{const changed=editorCategory!==title,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;editorCategory=title;
      for(const [section,anchor]of anchors)anchor.after(section);
      controlHost.hidden=true;sharedPreview.dataset.category=title;sharedPreview.syncCategory();
      for(const section of panel.querySelectorAll('[data-editor-section]')){section.hidden=title!=='all'&&section.dataset.editorSection!==title;
        if(!section.hidden&&['Sua mira','Posição da arma','HUD','Radar'].includes(title)){controlHost.append(section);controlHost.hidden=false;}
        if(changed&&!reduced&&!section.hidden&&title!=='all')section.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
      }
      for(const choice of shortcuts.children)choice.setAttribute('aria-pressed',String(choice.dataset.category===title));window.CSBoostPreview.sync3D();
    };
    const all=button('Visão geral',null,'editor-shortcut',()=>selectCategory('all'));all.dataset.category='all';all.setAttribute('aria-pressed',String(editorCategory==='all'));shortcuts.append(all);
    for(const section of sections){const title=section.querySelector('h3').textContent;section.dataset.editorSection=title;section.tabIndex=-1;section.hidden=editorCategory!=='all'&&editorCategory!==title;const choice=button(title,null,'editor-shortcut',()=>selectCategory(title));choice.dataset.category=title;choice.setAttribute('aria-pressed',String(editorCategory===title));shortcuts.append(choice);}
    panel.querySelector('.editor-header').after(shortcuts);shortcuts.after(sharedPreview);selectCategory(editorCategory);
    if(profile?.sectionSources&&Object.keys(profile.sectionSources).length){const origins=el('details','section-sources');origins.append(el('summary','','Última fonte copiada por seção'));for(const [section,source]of Object.entries(profile.sectionSources)){const row=el('div','section-source');append(row,el('span','field-help',(proSectionLabels[section]||section)+' · '+source.playerName+(source.customized?' · personalizada':'')),button('Ver fonte de '+(proSectionLabels[section]||section),null,'button button-quiet button-small',control=>action(control,()=>api.openProSource({id:source.playerId}))));origins.append(row);}origins.append(el('p','field-help','A origem indica a última cópia de campos publicados. Valores não publicados continuam da configuração base.'));panel.append(origins);}
    const apply = button('Aplicar no CS2', 'check', 'button button-primary button-small', control => action(control, async()=>{const result=await api.applyProfile(selectedProfileId);await refreshPart('profileConfig','getProfileConfigState');return result;}, 'Configuração salva em csboost.cfg. Inicie o jogo com +exec csboost.cfg para carregá-la.'));
    apply.id = 'apply-profile'; apply.disabled = !profile || dirty; apply.title = dirty ? 'Salve as alterações antes de aplicar.' : !profile ? 'Salve um perfil antes de aplicar.' : 'Gravar csboost.cfg na pasta do jogo';
    const exportButton = button('Exportar', 'download', 'button button-secondary button-small', control => action(control, () => api.exportProfile(selectedProfileId), result => `Configuração exportada${result?.path ? `: ${result.path}` : '.'}`));
    const portable=button('Exportar perfil JSON','download','button button-secondary button-small',control=>action(control,()=>api.exportPortableProfile(selectedProfileId),result=>result.canceled?'Exportação cancelada.':'Perfil portátil salvo.'));portable.disabled=!profile;
    exportButton.disabled = !profile;
    const rename = button('', 'edit', 'button button-quiet button-small button-icon', renameProfile); rename.disabled = !profile || dirty; rename.title = 'Renomear perfil'; rename.setAttribute('aria-label', 'Renomear perfil');
    const remove = button('', 'trash', 'button button-quiet button-small button-icon', removeProfile); remove.disabled = !profile; remove.title = 'Excluir perfil'; remove.setAttribute('aria-label', 'Excluir perfil');
    append(panel, append(el('div', 'editor-actions'), append(el('div', 'button-row'), rename, remove), append(el('div', 'button-row'),portable,exportButton,apply)));
    if(Object.keys(profile?.settings.graphics??{}).length){const video=renderProfileVideo(profile);video.dataset.editorSection='Vídeo';video.hidden=editorCategory!=='all'&&editorCategory!=='Vídeo';panel.append(video);}panel.append(renderProfileConfigRecovery());
    append(editor, panel, append(el('p', 'config-guide'), icon('info'), append(el('span'), document.createTextNode('Aplicar grava o arquivo '), el('code', '', 'csboost.cfg'), document.createTextNode(' e preserva uma cópia anterior. Para usá-lo, inicie o CS2 com '), el('code', '', '+exec csboost.cfg'), document.createTextNode('.'))));
    const launchConfig = button('Iniciar com a config aplicada', 'play', 'button button-secondary button-small', control => action(control, () => api.launchCS2({ withConfig: true,profileId:selectedProfileId }), result => result?.message || 'Inicialização com +exec csboost.cfg solicitada à Steam.'));
    append(editor, append(el('div', 'content-gap'), launchConfig));
    append(layout, profilesPanel, editor); page.append(layout);
  }

  function loadPage(key,method,options){if(Object.prototype.hasOwnProperty.call(data,key)||dataErrors[key]||pageLoading.has(key))return;pageLoading.add(key);(options===undefined?api[method]():api[method](options)).then(result=>{data[key]=result;}).catch(error=>{dataErrors[key]=error;}).finally(()=>{pageLoading.delete(key);render();});}
  function pageRefresh(key,method){return button('Atualizar','refresh','button button-secondary',()=>{delete data[key];delete dataErrors[key];loadPage(key,method);render();});}
  function renderOfficialSource(page,title,key){
    append(page,titleBlock(title,'Consulte a publicação diretamente na fonte oficial.','FONTES OFICIAIS'),append(el('section','panel content-card'),el('p','settings-description','Nesta edição, os dados e imagens desta fonte não são carregados nem exibidos pelo aplicativo.'),button('Abrir fonte oficial','external','button button-primary',control=>action(control,()=>api.openPublicationSource(key))),button('Limpar dados públicos antigos','trash','button button-secondary',control=>action(control,()=>api.clearPublicCache(),result=>result.removed+' arquivos de cache removidos.'))));
  }
  function renderNews(page){
    if(state.publicationPolicy?.news===false)return renderOfficialSource(page,'Notícias','news');
    append(page,append(el('div','page-heading'),titleBlock('Notícias','Atualizações oficiais do Counter-Strike 2.','DIRETO DA VALVE'),pageRefresh('news','getNews')));loadPage('news','getNews');
    if(dataErrors.news){page.append(errorBox(dataErrors.news));return;}const news=data.news;if(!news){page.append(el('p','empty-state','Consultando notícias oficiais…'));return;}
    page.append(el('p','data-source',`Fonte: ${news.source} · ${news.offline?'Cópia salva, sem conexão':'Atualizado em '+new Date(news.loadedAt).toLocaleString('pt-BR')}`));
    const grid=el('div','settings-grid news-grid');news.items.forEach(article=>{const card=el('article','panel content-card news-card');append(card,el('span','text-label',new Date(article.date).toLocaleDateString('pt-BR')),el('h2','',article.title),el('p','settings-description news-summary',article.summary),button('Ler publicação','external','button button-secondary button-small',control=>action(control,()=>api.openArticle(article.url))));grid.append(card);});if(!news.items.length)grid.append(el('p','empty-state','A fonte não retornou publicações.'));page.append(grid);
  }
  const proSectionLabels={mouse:'Mouse',crosshair:'Mira',viewmodel:'Viewmodel',video:'Vídeo: resolução, tela e FPS',hud:'HUD',radar:'Radar'};

  function invalidateProPreview() {
    proPreviewRequest++;
    proBusy=false;
    delete data.proPreview;
    delete dataErrors.proPreview;
    proImported=null;
  }

  async function refreshProCatalog(refresh=false) {
    const request=++proCatalogRequest;
    pageLoading.add('proCatalog');
    delete dataErrors.proCatalog;
    render();
    try {
      const catalog=await api.getProCatalog(refresh?{refresh:true}:{});
      if(request===proCatalogRequest)data.proCatalog=catalog;
    } catch(error) {
      if(request===proCatalogRequest)dataErrors.proCatalog=error;
    } finally {
      if(request===proCatalogRequest){pageLoading.delete('proCatalog');render();}
    }
  }

  async function selectProPlayer(id,refresh=false) {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)){
      notify('Use o identificador da página: letras minúsculas, números e hífens, como m0nesy.',true);
      return;
    }
    const changing=proPlayerId!==id,request=++proRequest;
    proPlayerId=id;
    invalidateProPreview();
    delete data.proPlayer;
    delete dataErrors.proPlayer;
    if(changing){proSections=['mouse','crosshair','viewmodel'];proProfileId=selectedProfileId;proDpi='';proProfileName='';}
    pageLoading.add('proPlayer');
    render();
    try {
      const player=await api.getProPlayer({id,...(refresh?{refresh:true}:{})});
      if(request!==proRequest)return;
      data.proPlayer=player;
      const compatible=new Set(player.sections.filter(section=>section.fields.some(field=>field.copyable)).map(section=>section.id));
      proSections=proSections.filter(section=>compatible.has(section));
      if(!proProfileName)proProfileName=`${player.name} · CSBOOST`;
    } catch(error) {
      if(request===proRequest)dataErrors.proPlayer=error;
    } finally {
      if(request===proRequest){pageLoading.delete('proPlayer');render();}
    }
  }

  function proConfigRequest() {
    const request={id:proPlayerId,profileId:proProfileId||null,sections:[...proSections]};
    if(proDpi.trim()){
      const dpi=Number(proDpi);
      if(!Number.isFinite(dpi)||dpi<=0||!Number.isInteger(dpi))throw new Error('Informe um DPI atual inteiro maior que zero ou deixe o campo vazio.');
      request.currentDpi=dpi;
    }
    return request;
  }

  async function previewProConfig() {
    if(!proSections.length){notify('Selecione ao menos uma seção com valores compatíveis.',true);return;}
    let options;
    try {options=proConfigRequest();}catch(error){notify(errorText(error),true);return;}
    const request=++proPreviewRequest;
    proBusy=true;
    delete data.proPreview;
    delete dataErrors.proPreview;
    proImported=null;
    render();
    try {
      const preview=await api.previewProConfig(options);
      if(request===proPreviewRequest)data.proPreview={...preview,request:options};
    } catch(error) {
      if(request===proPreviewRequest)dataErrors.proPreview=error;
    } finally {
      if(request===proPreviewRequest){proBusy=false;render();}
    }
  }

  function validatedProRequest() {
    const preview=data.proPreview;
    if(!preview||JSON.stringify(preview.request)!==JSON.stringify(proConfigRequest()))throw new Error('As opções mudaram. Confira uma nova prévia antes de continuar.');
    return {...preview.request,previewFingerprint:preview.previewFingerprint};
  }

  function proValue(value) {
    if(value===undefined||value===null||value==='')return 'Não publicado';
    if(typeof value==='boolean')return value?'Ligado':'Desligado';
    if(Array.isArray(value))return value.join(' · ');
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  }

  function proSource(source,catalog=false) {
    const box=el('div','pro-source');
    const name=typeof source?.source==='string'?source.source:source?.name||'ProSettings.net';
    append(box,el('p','',`Fonte: ${name} · ${source?.offline?'Cópia salva, sem conexão':'Consulta pública'}`),el('p','',`Consultado em ${timeText(source?.loadedAt)}${source?.updatedAt?' · Atualização publicada: '+timeText(source.updatedAt):''}`));
    if(source?.refreshError)box.append(el('p','pro-source-warning',`A atualização falhou: ${errorText(source.refreshError)}`));
    if(!catalog)box.append(el('p','','Valores publicados pela fonte; não verificados diretamente com o jogador.'));
    return box;
  }

  function configThumbnail(settings,small=false){
    const box=el('span',`config-thumbnail${small?' compact':''}`),graphic=document.createElementNS(svgNS,'svg');
    box.setAttribute('role','img');box.setAttribute('aria-label','Prévia aproximada da mira salva no perfil');
    window.CSBoostCrosshairPreview.draw(graphic,settings.crosshair,{width:small?72:280,height:small?46:158,renderHeight:1080});
    box.append(graphic);if(!small)append(box,el('span','config-thumbnail-caption','MIRA · AMPLIADA'),el('span','config-thumbnail-resolution',`${settings.video.width} × ${settings.video.height}`));return box;
  }
  function publicPortrait(request,label,className){
    const box=el('span','public-media '+className),fallback=el('span','public-media-fallback',label.slice(0,2).toUpperCase());box.append(fallback);
    box.setAttribute('role','img');box.setAttribute('aria-label',request.kind==='player'?`Foto de ${label}`:`Logo de ${label}`);box.dataset.publicMedia=JSON.stringify(request);
    return box;
  }
  function observePublicMedia(){
    mediaObserver?.disconnect();
    if(!publicMediaEnabled||state.publicationPolicy?.publicMedia===false)return;
    const paint=(box,value)=>{if(!publicMediaEnabled||!box.isConnected||!value?.available||!/^data:image\/(?:png|webp|svg\+xml);base64,[a-zA-Z0-9+/]+=*$/.test(value.dataUrl)||value.dataUrl.length>430000)return;
      const img=el('img');img.alt='';img.decoding='async';img.width=240;img.height=240;img.addEventListener('load',()=>box.classList.add('has-image'),{once:true});img.addEventListener('error',()=>img.remove(),{once:true});img.src=value.dataUrl;box.append(img);box.title=`Imagem: ProSettings.net${value.offline?' · cópia salva':''}`;
    };
    mediaObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const box=entry.target,key=box.dataset.publicMedia;mediaObserver.unobserve(box);
      const prior=mediaMemory.get(key);if(prior&&prior.expires>Date.now()){paint(box,prior.value);continue;}
      if(!mediaJobs.has(key)){const request=JSON.parse(key),job=api.getPublicMedia(request).catch(()=>({available:false})).then(value=>{if(!value.deferred){mediaMemory.set(key,{value,expires:Date.now()+(value.available?3600000:60000)});while(mediaMemory.size>192)mediaMemory.delete(mediaMemory.keys().next().value);}return value;}).finally(()=>mediaJobs.delete(key));mediaJobs.set(key,job);}
      mediaJobs.get(key).then(value=>paint(box,value));
    }},{rootMargin:'40px'});
    app.querySelectorAll('[data-public-media]').forEach(box=>mediaObserver.observe(box));
  }

  function renderTeams(page) {
    if(state.publicationPolicy?.proSettings===false)return renderOfficialSource(page,'Times e configs','proSettings');
    const heading=append(el('div','page-heading'),titleBlock('Times e configs','Configurações publicadas de jogadores profissionais.','INSPIRE O SEU JOGO'));
    page.append(heading);
    const tabs=el('div','pro-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Times e configurações');
    for(const[id,label]of [['pros','Configs profissionais'],['ranking','Ranking e elencos']]){
      const tab=button(label,null,`pro-tab${teamsTab===id?' active':''}`,()=>{teamsTab=id;render();});
      tab.id=`teams-tab-${id}`;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(teamsTab===id));tab.setAttribute('aria-controls','teams-tab-content');
      tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();teamsTab=event.key==='Home'?'pros':event.key==='End'?'ranking':teamsTab==='pros'?'ranking':'pros';render();document.getElementById(`teams-tab-${teamsTab}`)?.focus();});
      tabs.append(tab);
    }
    page.append(tabs);
    const content=el('div','pro-tab-content');content.id='teams-tab-content';content.setAttribute('role','tabpanel');content.setAttribute('aria-labelledby',`teams-tab-${teamsTab}`);page.append(content);
    if(teamsTab==='ranking'){renderRankings(content,true);return;}
    if(!Object.prototype.hasOwnProperty.call(data,'proCatalog')&&!dataErrors.proCatalog&&!pageLoading.has('proCatalog'))queueMicrotask(()=>{if(!data.proCatalog&&!pageLoading.has('proCatalog'))refreshProCatalog();});
    const toolbar=el('div','pro-library-toolbar');
    const refresh=button('Atualizar biblioteca','refresh','button button-secondary button-small',()=>refreshProCatalog(true));refresh.disabled=pageLoading.has('proCatalog');
    append(toolbar,el('p','pro-intro','Copie só o que faz sentido para você. Confira as diferenças e salve em um novo perfil antes de aplicar ao jogo.'),refresh);content.append(toolbar);
    if(dataErrors.proCatalog)content.append(errorBox(dataErrors.proCatalog));
    const catalog=data.proCatalog;
    if(catalog){content.append(proSource(catalog,true));content.append(el('p','pro-scope',typeof catalog.scope==='string'?catalog.scope:'Lista pública inicial. Outros jogadores podem ser consultados pelo identificador da página.'));}
    const discover=el('form','pro-discover');
    const manual=el('input','native-select');manual.type='text';manual.value=proManualId;manual.placeholder='Identificador: m0nesy, fallen…';manual.maxLength=80;manual.pattern='[a-z0-9]+(?:-[a-z0-9]+)*';manual.setAttribute('aria-label','Identificador de outro jogador');manual.addEventListener('input',()=>{proManualId=manual.value;});
    const lookup=button('Consultar outro jogador','plus','button button-secondary button-small',()=>{proManualId=manual.value.trim().toLowerCase();selectProPlayer(proManualId);});
    discover.addEventListener('submit',event=>{event.preventDefault();proManualId=manual.value.trim().toLowerCase();selectProPlayer(proManualId);});
    append(discover,manual,lookup,el('p','field-help','Use a parte final da página pública, por exemplo prosettings.net/players/m0nesy/. A consulta não exige que o jogador esteja na lista inicial.'));content.append(discover);
    const layout=el('div','pro-library-layout'),browse=el('section','pro-browse'),detail=el('section','pro-details');browse.setAttribute('aria-label','Biblioteca de jogadores');detail.setAttribute('aria-label','Config do jogador');
    if(catalog){
      const filters=el('div','pro-filters'),search=el('input','native-select pro-search'),team=el('select','native-select pro-team-filter');
      search.type='search';search.placeholder='Buscar jogador ou time';search.value=proSearch;search.setAttribute('aria-label','Buscar jogador ou time na biblioteca');
      team.setAttribute('aria-label','Filtrar configs por time');const all=el('option','','Todos os times');all.value='';team.append(all);
      [...new Set(catalog.players.map(player=>player.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(name=>{const option=el('option','',name);option.value=name;team.append(option);});team.value=proTeam;
      const count=el('p','pro-result-count'),grid=el('div','pro-player-grid');grid.setAttribute('aria-label','Jogadores encontrados');
      function populate(){
        proSearch=search.value;proTeam=team.value;grid.replaceChildren();
        const term=proSearch.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
        const players=catalog.players.filter(player=>(!proTeam||player.team===proTeam)&&`${player.name} ${player.team||''} ${(player.aliases||[]).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(term));
        count.textContent=`${players.length} de ${catalog.players.length} jogadores na lista inicial`;
        players.forEach(player=>{
          const card=button('',null,`pro-player-card${proPlayerId===player.id?' active':''}`,()=>selectProPlayer(player.id));card.setAttribute('aria-label',`Ver config de ${player.name}`);card.setAttribute('aria-pressed',String(proPlayerId===player.id));
          append(card,append(el('div','pro-player-card-head'),publicPortrait({kind:'player',id:player.id},player.name,'pro-player-avatar'),append(el('div','pro-player-identity'),el('strong','',player.name),append(el('span','pro-player-team'),publicPortrait({kind:'team',name:player.team},player.team,'pro-team-mark'),document.createTextNode(player.team||'Time não publicado')))),append(el('div','pro-player-stats'),append(el('div'),el('span','','Sens.'),el('strong','',proValue(player.sensitivity))),append(el('div'),el('span','','DPI'),el('strong','',proValue(player.dpi))),append(el('div'),el('span','','eDPI'),el('strong','',proValue(player.edpi)))),el('small','pro-player-resolution',proValue(player.resolution)));
          grid.append(card);
        });
        if(!players.length)grid.append(el('p','empty-state','Nenhum jogador nesta lista corresponde ao filtro. Consulte outro identificador acima.'));
        queueMicrotask(observePublicMedia);
      }
      search.addEventListener('input',populate);team.addEventListener('change',populate);append(filters,search,team);append(browse,filters,count,grid);populate();
    }else browse.append(el('p','empty-state',pageLoading.has('proCatalog')?'Consultando a lista pública de jogadores…':'A biblioteca não pôde ser carregada. Você ainda pode consultar um identificador.'));
    if(pageLoading.has('proPlayer'))detail.append(append(el('div','panel pro-empty-detail'),el('span','spinner'),el('p','','Consultando os valores publicados…')));
    else if(dataErrors.proPlayer)detail.append(append(el('div','panel pro-empty-detail'),errorBox(dataErrors.proPlayer),button('Tentar novamente','refresh','button button-secondary button-small',()=>selectProPlayer(proPlayerId,true))));
    else if(data.proPlayer?.id===proPlayerId)renderProPlayer(detail,data.proPlayer);
    else detail.append(append(el('div','panel pro-empty-detail'),icon('crosshair'),el('h2','','Encontre sua próxima config'),el('p','','Selecione um jogador para consultar mouse, mira, viewmodel e outros valores publicados.'),el('p','field-help','DPI físico, frequência do monitor, hardware e gráficos avançados são informações de consulta. Nenhum ajuste é aplicado ao escolher um jogador.')));
    append(layout,browse,detail);content.append(layout);
  }

  function renderProPlayer(container,player) {
    const panel=el('article','panel pro-player-detail');
    append(panel,append(el('div','pro-detail-heading'),publicPortrait({kind:'player',id:player.id},player.name,'pro-hero-portrait'),append(el('div','pro-detail-identity'),append(el('p','eyebrow pro-hero-team'),publicPortrait({kind:'team',name:player.team},player.team,'pro-team-mark'),document.createTextNode(player.team||'CONFIG PROFISSIONAL')),el('h2','',player.name),el('span','tag','Config publicada'))),proSource(player.source),append(el('div','button-row'),button('Abrir fonte','external','button button-secondary button-small',control=>action(control,()=>api.openProSource({id:player.id}))),button('Atualizar jogador','refresh','button button-quiet button-small',()=>selectProPlayer(player.id,true))));
    const published=el('div','pro-published-sections');
    for(const section of player.sections){
      const item=el('details','pro-published-section');item.open=section.id==='mouse';item.append(el('summary','',section.label));
      const list=el('dl','pro-values');
      for(const field of section.fields){const row=el('div','pro-value');append(row,el('dt','',field.label),el('dd',field.value===null||field.value===undefined?'muted-text':'',proValue(field.value)));if(field.reason)row.append(el('p','field-help',field.reason));list.append(row);}
      if(!section.fields.length)list.append(el('p','field-help','Nenhum valor publicado para esta seção.'));
      item.append(list);published.append(item);
    }
    panel.append(published);
    for(const warning of player.warnings||[])panel.append(el('p','pro-warning',warning));
    panel.append(note('Copiar valores de um profissional não garante mais FPS ou melhor desempenho. DPI físico e Hz não são alterados; alguns gráficos avançados podem ser salvos e aplicados pelo botão próprio no editor; hardware e opções não mapeadas ficam para consulta.',true));
    const builder=el('section','pro-config-builder');append(builder,el('p','eyebrow','MONTE SEU PERFIL'),el('h3','','O que você quer copiar?'));
    const selectors=el('div','pro-section-selectors');
    for(const[id,label]of Object.entries(proSectionLabels)){
      const section=player.sections.find(section=>section.id===id),available=section?.fields.some(field=>field.copyable),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=available&&proSections.includes(id);checkbox.disabled=!available||proBusy;checkbox.setAttribute('aria-label',`Copiar ${label}`);
      checkbox.addEventListener('change',()=>{proSections=checkbox.checked?[...new Set([...proSections,id])]:proSections.filter(value=>value!==id);invalidateProPreview();render();});
      selectors.append(append(el('label',`pro-section-selector${available?'':' unavailable'}`),checkbox,el('span','',label),!available&&el('small','','Sem valores compatíveis')));
    }
    builder.append(selectors);const choose=ids=>{proSections=ids.filter(id=>player.sections.some(section=>section.id===id&&section.fields.some(field=>field.copyable)));if(!proSections.includes('mouse'))proDpi='';invalidateProPreview();render();};append(builder,append(el('div','button-row pro-selection-actions'),button('Somente mira','crosshair','button button-quiet button-small',()=>choose(['crosshair'])),button('Mouse, mira e arma','mouse','button button-quiet button-small',()=>choose(['mouse','crosshair','viewmodel'])),button('Selecionar compatíveis','check','button button-secondary button-small',()=>choose(Object.keys(proSectionLabels)))));
    const form=el('div','pro-profile-fields');
    const base=el('select','native-select');base.setAttribute('aria-label','Perfil base para a config profissional');base.disabled=proBusy;
    const fresh=el('option','','Novo perfil com padrões próprios do CSBOOST');fresh.value='';base.append(fresh);
    for(const profile of data.profiles){const option=el('option','',profile.name);option.value=profile.id;base.append(option);}base.value=proProfileId||'';
    base.addEventListener('change',()=>{proProfileId=base.value||null;invalidateProPreview();render();});
    const dpi=el('input','native-select');dpi.type='number';dpi.min='50';dpi.max='100000';dpi.step='1';dpi.placeholder='Opcional: seu DPI físico';dpi.value=proDpi;dpi.disabled=proBusy;dpi.setAttribute('aria-label','Seu DPI atual para converter eDPI');
    dpi.addEventListener('input',()=>{proDpi=dpi.value;invalidateProPreview();const result=document.querySelector('.pro-config-preview');result?.remove();document.querySelectorAll('[data-pro-preview-action]').forEach(control=>{control.disabled=true;});});
    const name=el('input','native-select');name.type='text';name.maxLength=60;name.value=proProfileName;name.disabled=proBusy;name.setAttribute('aria-label','Nome do novo perfil profissional');name.addEventListener('input',()=>{proProfileName=name.value;});
    append(form,append(el('label','pro-profile-field'),el('span','','Preservar as outras opções deste perfil'),base),append(el('label','pro-profile-field'),el('span','','Converter sensibilidade para seu DPI'),dpi),append(el('label','pro-profile-field pro-profile-name'),el('span','','Nome do novo perfil'),name));
    append(builder,form,el('p','field-help','O perfil base é preservado. Se escolher padrões próprios, os campos não publicados virão dos padrões do CSBOOST, sem atribuí-los ao jogador. O eDPI só é convertido quando a fonte publica valores suficientes.'),el('p','field-help','Vídeo é opcional e começa desmarcado. Compare a qualidade da imagem e os modos disponíveis no seu monitor antes de aplicar.'),button(proBusy?'Preparando prévia…':'Conferir diferenças','crosshair','button button-primary pro-preview-button',()=>previewProConfig()));
    builder.querySelector('.pro-preview-button').disabled=proBusy||!proSections.length;
    if(dataErrors.proPreview)builder.append(errorBox(dataErrors.proPreview));
    if(data.proPreview)builder.append(renderProPreview(data.proPreview));
    if(proImported){append(builder,el('p','success-text',proImported.updatedExisting?`Seções copiadas para ${proImported.name}. O jogo não foi alterado.`:`Perfil ${proImported.name} salvo. Seu perfil base e o jogo foram preservados.`),button(proImported.updatedExisting?'Editar perfil':'Editar novo perfil','crosshair','button button-secondary',control=>action(control,async()=>{const id=proImported.id;await reloadProfiles(id);navigate('config');})));}panel.insertBefore(builder,published);container.append(panel);
  }

  function renderProPreview(preview) {
    const box=el('section','pro-config-preview');
    append(box,el('h3','','Prévia do novo perfil'),el('p','field-help','Base: '+(preview.baseName||'Padrões próprios do CSBOOST')+' · '+preview.changes.length+' diferenças. Nenhuma alteração foi aplicada ao jogo.'));
    const visual=el('div','pro-config-visual');append(visual,configThumbnail(preview.settings),append(el('div','pro-config-visual-stats'),el('strong','','Seu perfil composto'),el('p','','Sens. '+preview.settings.sensitivity+' · FOV '+preview.settings.viewmodelFov),el('p','',preview.settings.video.width+' × '+preview.settings.video.height+' · '+(preview.settings.fpsMax?preview.settings.fpsMax+' FPS limite':'FPS sem limite')),el('p','field-help','Mira ampliada para consulta. As opções fora da seleção vêm da base; a cena é ilustrativa.')));box.append(visual);
    if(preview.changes.length){
      const scroll=el('div','pro-diff-scroll'),table=el('table','optimization-table pro-diff-table'),head=el('thead'),row=el('tr');
      for(const label of ['Opção','Antes','Depois'])row.append(el('th','',label));head.append(row);table.append(head);
      const body=el('tbody');
      for(const change of preview.changes)body.append(append(el('tr'),append(el('td'),el('span','pro-diff-section',proSectionLabels[change.section]||change.section),el('strong','',change.label||change.key)),el('td','',proValue(change.before)),el('td','',proValue(change.after))));
      append(table,body);scroll.append(table);box.append(scroll);
    }else box.append(el('p','field-help','Os valores selecionados já correspondem à base. Você ainda pode criar uma cópia independente.'));
    for(const warning of preview.warnings||[])box.append(el('p','pro-warning',warning));
    const commands=typeof preview.commands==='string'?preview.commands:Array.isArray(preview.commands)?preview.commands.map(command=>typeof command==='string'?command:command.command||`${command.key} ${command.value}`).join('\n'):'';
    const detailsNode=el('details','pro-commands');detailsNode.append(el('summary','','Ver comandos compatíveis selecionados'));
    const output=el('textarea','native-select');output.readOnly=true;output.rows=6;output.value=commands;output.setAttribute('aria-label','Comandos profissionais selecionados');output.addEventListener('focus',()=>output.select());detailsNode.append(output);box.append(detailsNode);
    const buttons=el('div','button-row');
    const save=button('Salvar como novo perfil','save','button button-primary',control=>action(control,async()=>{
      const options=validatedProRequest(),name=proProfileName.trim();
      if(!name)throw new Error('Dê um nome ao novo perfil.');
      const result=await api.importProConfig({...options,name});
      data.profiles=await api.listProfiles();delete dataErrors.profiles;
      proImported=result.profile;
      invalidateProPreview();proImported=result.profile;
      render();
      notify('Novo perfil salvo. Confira no editor e aplique ao CS2 quando desejar.');
      return result;
    }));save.dataset.proPreviewAction='save';
    const copy=button('Copiar comandos','file','button button-secondary',control=>action(control,()=>api.copyProCommands(validatedProRequest()),'Comandos selecionados copiados. DPI físico e Hz preservados.'));copy.dataset.proPreviewAction='copy';
    const exportButton=button('Exportar CFG','download','button button-secondary',control=>action(control,()=>api.exportProConfig(validatedProRequest()),result=>result?.canceled?'':`CFG exportado${result?.path?': '+result.path:'.'}`));exportButton.dataset.proPreviewAction='export';
    const into=button('Copiar para o perfil base','check','button button-secondary',control=>action(control,async()=>{const result=await api.copyProToProfile(validatedProRequest());data.profiles=await api.listProfiles();delete dataErrors.profiles;invalidateProPreview();proImported={...result.profile,updatedExisting:true};render();return result;},'Seções salvas no perfil base. O jogo não foi alterado.'));into.disabled=!proProfileId;into.dataset.proPreviewAction='into';
    append(buttons,save,into,copy,exportButton);box.append(buttons);return box;
  }

  function renderRankings(page,embedded=false){
    if(state.publicationPolicy?.rankings===false)return renderOfficialSource(page,'Ranking','rankings');
    const isTeams=currentView==='teams';append(page,append(el('div','page-heading'),titleBlock(isTeams?'Ranking e elencos':'Ranking Valve',isTeams?'Elencos publicados no ranking oficial.':'Classificação global publicada pela Valve.',embedded?null:'CENÁRIO COMPETITIVO'),pageRefresh('rankings','getRankings')));loadPage('rankings','getRankings');
    if(dataErrors.rankings){page.append(errorBox(dataErrors.rankings));return;}const ranking=data.rankings;if(!ranking){page.append(el('p','empty-state','Consultando a publicação da Valve…'));return;}
    page.append(el('p','data-source','Publicação de '+ranking.asOf+' · '+(ranking.offline?'Cópia salva, sem conexão':'Fonte: ValveSoftware / GitHub')+' · '+ranking.teams.length+' times'));
    if(ranking.refreshError)page.append(el('p','pro-source-warning','A atualização falhou: '+errorText(ranking.refreshError)));if(ranking.cacheWarning)page.append(el('p','pro-source-warning',ranking.cacheWarning));
    page.append(append(el('div','ranking-attribution'),el('p','field-help','Logos: ProSettings.net. O elenco corresponde à data da Valve; a config pode publicar um time mais recente.'),button('Fonte dos logos','external','button button-quiet button-small',control=>action(control,()=>api.openProSource({kind:'teams'})))));
    const search=el('input','native-select ranking-search');search.type='search';search.value=rankingSearch;search.placeholder='Buscar time ou jogador';search.setAttribute('aria-label','Buscar time ou jogador');page.append(search);const list=el('div','ranking-list ranking-grid'),pager=el('div','ranking-pager');
    function openRoster(name){
      teamsTab='pros';proSearch=name;proTeam='';proManualId='';proRequest++;proPlayerId='';delete data.proPlayer;delete dataErrors.proPlayer;proImported=null;proBusy=false;invalidateProPreview();
      const matches=(data.proCatalog?.players||[]).filter(player=>[player.name,...(player.aliases||[])].some(alias=>alias.normalize('NFC').toLowerCase()===name.normalize('NFC').toLowerCase()));
      navigate('teams');if(matches.length===1)selectProPlayer(matches[0].id);
      else refreshProCatalog().then(()=>{const found=(data.proCatalog?.players||[]).filter(player=>[player.name,...(player.aliases||[])].some(alias=>alias.normalize('NFC').toLowerCase()===name.normalize('NFC').toLowerCase()));if(currentView==='teams'&&teamsTab==='pros'&&proSearch===name&&found.length===1)selectProPlayer(found[0].id);});
    }
    function populate(){
      list.replaceChildren();pager.replaceChildren();rankingSearch=search.value;const term=rankingSearch.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
      const found=ranking.teams.filter(team=>(team.name+' '+team.roster.join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(term)),pages=Math.max(1,Math.ceil(found.length/24));rankingPage=Math.min(rankingPage,pages-1);
      for(const team of found.slice(rankingPage*24,rankingPage*24+24)){
        const card=el('article','panel ranking-row ranking-card'),top=el('div','ranking-card-top');
        append(top,el('strong','ranking-place',String(team.rank).padStart(2,'0')),el('span','ranking-points',team.points+' pontos'));
        append(card,top,publicPortrait({kind:'team',name:team.name},team.name,'ranking-team-logo'),append(el('div','ranking-team'),el('h2','',team.name),append(el('div','roster-config-links'),...team.roster.map(name=>button(name,null,'roster-config-link',()=>openRoster(name))))));list.append(card);
      }
      if(!found.length)list.append(el('p','empty-state','Nenhum time ou jogador corresponde à busca.'));
      const previous=button('Anterior','chevron','button button-secondary button-small',()=>{rankingPage--;populate();}),next=button('Próxima','chevron','button button-secondary button-small',()=>{rankingPage++;populate();});previous.disabled=rankingPage===0;next.disabled=rankingPage===pages-1;
      append(pager,previous,el('span','',found.length+' times · Página '+(rankingPage+1)+' de '+pages),next);queueMicrotask(observePublicMedia);
    }
    search.addEventListener('input',()=>{rankingPage=0;populate();});populate();append(page,list,pager);
  }
  function renderBenchmarks(page){
    append(page,append(el('div','page-heading'),titleBlock('Benchmark','Histórico de medições reais do CS2.','MEÇA ANTES DE COMPARAR'),button('Importar console.log','plus','button button-primary',control=>action(control,async()=>{const result=await api.importBenchmark();if(!result.canceled){delete data.benchmarks;delete dataErrors.benchmarks;loadPage('benchmarks','listBenchmarks');}return result;},result=>result?.canceled?'Importação cancelada.':'Resultado real importado.'))));
    page.append(el('p','field-help','O próprio aplicativo e outros programas influenciam a medição. Mantenha condições semelhantes; as faixas observadas não são intervalos de confiança.'));
    page.append(renderBenchmarkRunner());
    page.append(renderBenchmarkSetup());
    const guide=el('section','panel content-card');append(guide,el('h2','','Importação manual de logs'),el('p','settings-description','Você também pode importar medições de outro mapa. Use o mesmo cenário nos grupos antes/depois e faça pelo menos 5 execuções por grupo.'),el('p','settings-description','Cada importação manual usa o último resultado VProf completo do arquivo. P1 é o 1% low informado pelo jogo. O FPS precisa vir de uma medição real; não é estimado pelo hardware.'),button('Iniciar CS2 com log','play','button button-secondary',control=>action(control,()=>api.launchBenchmark(),'Inicialização com -condebug solicitada à Steam. Execute seu benchmark no jogo.')));page.append(guide);
    loadPage('benchmarks','listBenchmarks');if(dataErrors.benchmarks){page.append(errorBox(dataErrors.benchmarks));return;}const reports=data.benchmarks;if(!reports){page.append(el('p','empty-state','Lendo histórico…'));return;}if(!reports.length){page.append(el('p','empty-state','Nenhuma medição importada. Importe um log real para começar.'));return;}
    page.append(append(el('div','button-row content-gap'),...['csv','json'].map(format=>button('Exportar histórico '+format.toUpperCase(),'download','button button-secondary',control=>action(control,()=>api.exportBenchmarkHistory(format),result=>result.canceled?'Exportação cancelada.':'Histórico exportado.')))));
    if(reports.length>=2)page.append(renderComparison(reports));
    const grid=el('div','settings-grid');reports.forEach(report=>{const card=el('article','panel content-card');append(card,el('span','text-label',new Date(report.importedAt).toLocaleString('pt-BR')),el('h2','',`${report.averageFps.toFixed(1)} FPS médio`),el('p','settings-description',`1% low: ${report.onePercentLow.toFixed(1)} FPS · ${report.frameTimeMs.toFixed(2)} ms médios`),el('p','field-help',report.sourceName),renderBenchmarkContext(report.context),button('Exportar relatório','download','button button-secondary button-small',control=>action(control,()=>api.exportBenchmark(report.id),result=>result.canceled?'Exportação cancelada.':'Relatório exportado.')));grid.append(card);});page.append(grid);
  }
  function renderBenchmarkSetup(){
    const panel=el('section','panel content-card benchmark-setup');append(panel,el('h2','','Assistente antes e depois'),el('p','settings-description','Guarde as medições Antes, registre o ajuste, retome após reiniciar se necessário e compare o Depois. O progresso fica salvo neste PC.'));
    loadPage('benchmarkSetup','getBenchmarkSetup');if(dataErrors.benchmarkSetup){append(panel,errorBox(dataErrors.benchmarkSetup),pageRefresh('benchmarkSetup','getBenchmarkSetup'));return panel;}
    if(!Object.hasOwn(data,'benchmarkSetup')){panel.append(el('p','field-help','Lendo progresso salvo…'));return panel;}
    const setup=data.benchmarkSetup;
    const refresh=async operation=>{const result=await operation();data.benchmarkSetup=await api.getBenchmarkSetup();data.benchmarkRun=await api.getBenchmarkRun();render();return result;};
    if(!setup||setup.status!=='active'){
      if(setup?.comparison)append(panel,el('p','success-text',`Último estudo: ${numberText(setup.comparison.before.averageFps)} → ${numberText(setup.comparison.after.averageFps)} FPS médios; P1 ${numberText(setup.comparison.before.onePercentLow)} → ${numberText(setup.comparison.after.onePercentLow)}.`),button('Exportar estudo concluído','download','button button-secondary',control=>action(control,()=>api.exportBenchmarkComparison({baselineIds:setup.baselineIds,optimizedIds:setup.optimizedIds}))));
      if(setup?.comparison)renderComparisonStats(panel,setup.comparison);
      const count=el('select','native-select'),mode=el('select','native-select');count.setAttribute('aria-label','Medições por grupo');for(const value of [1]){const option=el('option','','Uma medição Antes e uma Depois');option.value=value;count.append(option);}mode.setAttribute('aria-label','Modo do estudo Depois');for(const[value,label]of [['current','Depois: ajustes manuais, preservar CPU/energia'],['boosted','Depois: usar a sessão de CPU/energia selecionada']]){const option=el('option','',label);option.value=value;mode.append(option);}
      append(panel,append(el('div','button-row'),count,mode,button('Criar estudo de FPS','plus','button button-secondary',control=>action(control,()=>refresh(()=>api.createBenchmarkSetup({targetRuns:Number(count.value),preset:'performance',optimizedMode:mode.value}))))));return panel;
    }
    const stages={preparation:'Preparação',baseline:'Medições Antes',adjustments:'Registrar ajustes','awaiting-reboot':'Aguardando reinicialização manual',optimized:'Medições Depois',results:'Comparar resultados',completed:'Concluído',cancelled:'Cancelado'};
    append(panel,details([['Etapa',stages[setup.stage]||setup.stage],['Antes',`${setup.baselineIds.length} / ${setup.targetRuns}`],['Depois',`${setup.optimizedIds.length} / ${setup.targetRuns}`],['Modo Depois',setup.optimizedMode==='current'?'Preservar CPU e energia atuais':'Sessão de CPU/energia selecionada']]));
    const checks=el('div','setup-checks'),manual={};
    for(const check of setup.checklist){if(check.automatic)checks.append(el('p',check.ready?'field-help success-text':'field-help',`${check.ready?'✓':'○'} ${check.label}${check.reason?' '+check.reason:''}`));else{const input=el('input');input.type='checkbox';input.checked=check.ready;input.setAttribute('aria-label',check.label);manual[check.id]=input;checks.append(append(el('label','checkbox-label'),input,document.createTextNode(check.label)));}}
    append(panel,checks,button('Salvar condições do teste','check','button button-secondary',control=>action(control,()=>refresh(()=>api.confirmBenchmarkPreparation(Object.fromEntries(Object.entries(manual).map(([key,input])=>[key,input.checked])))))));
    for(const warning of setup.warnings)panel.append(el('p','field-help',warning));if(setup.lastError)panel.append(errorBox(setup.lastError.message));
    if(setup.adjustments.rebootPending){append(panel,el('p','field-help','O estudo está salvo. Reinicie manualmente quando estiver pronto; este estudo não reinicia automaticamente o PC ou aplica ajustes de firmware.'),button('Conferir reinicialização e retomar','refresh','button button-secondary',control=>action(control,()=>refresh(()=>api.resumeBenchmarkSetup({})))));if(!setup.adjustments.bootBefore)panel.append(button('Já reiniciei: confirmar manualmente','check','button button-quiet',control=>action(control,()=>refresh(()=>api.resumeBenchmarkSetup({confirmManualRestart:true})))));}
    const reports=(data.benchmarks||[]).filter(report=>report.durationSeconds>=90&&!report.context?.collectorInterrupted);
    for(const[group,label]of [['baseline','Antes'],['optimized','Depois']]){
      const selected=setup[group+'Ids'];if(group==='baseline'&&setup.adjustments.confirmed||group==='optimized'&&(!setup.adjustments.confirmed||setup.adjustments.rebootPending))continue;
      const start=button(`Medir ${label} pelo assistente`,'play','button button-primary',control=>action(control,()=>refresh(()=>api.startBenchmarkSetupRun({group,processPolicy:sessionProcessPolicy,tuningNote:group==='baseline'?benchmarkTuningNote:setup.adjustments.note}))));start.disabled=!(group==='baseline'?setup.canStartBaseline:setup.canStartOptimized);panel.append(append(el('div','button-row'),start));
      if(reports.length){const select=el('select','native-select');select.multiple=true;select.size=Math.min(4,reports.length);select.setAttribute('aria-label',`Medições ${label} do assistente`);for(const report of reports){const option=el('option','',`${report.averageFps} FPS · P1 ${report.onePercentLow} · ${new Date(report.importedAt).toLocaleString('pt-BR')}`);option.value=report.id;option.selected=selected.includes(report.id);select.append(option);}append(panel,select,button(`Usar resultados selecionados como ${label}`,'check','button button-secondary',control=>action(control,()=>refresh(()=>api.selectBenchmarkSetupResults({group,ids:[...select.selectedOptions].map(option=>option.value)})))));}
    }
    if(setup.baselineIds.length>=setup.targetRuns&&!setup.adjustments.confirmed){const noteInput=el('input','native-select');noteInput.maxLength=300;noteInput.placeholder='Descreva o que alterou: vídeo, driver, PBO/CO ou memória';noteInput.setAttribute('aria-label','Ajustes feitos antes do Depois');const restart=el('input');restart.type='checkbox';restart.setAttribute('aria-label','Ajuste exige reinicialização');append(panel,el('h3','','Registrar o ajuste feito'),noteInput,append(el('label','checkbox-label'),restart,document.createTextNode('O ajuste exige reinicialização manual')),el('p','field-help','Este registro não aplica alterações. Use os controles de Desempenho, o Ryzen Master ou a BIOS e anote o que realmente mudou.'),button('Registrar ajustes e continuar','arrow','button button-secondary',control=>action(control,()=>refresh(()=>api.markBenchmarkAdjustments({note:noteInput.value,rebootRequired:restart.checked})))));}
    const compare=button('Concluir estudo e comparar','performance','button button-primary',control=>action(control,()=>refresh(()=>api.compareBenchmarkSetup())));compare.disabled=!setup.canCompare;append(panel,append(el('div','button-row'),compare,button('Atualizar estudo','refresh','button button-secondary',control=>action(control,()=>refresh(()=>api.getBenchmarkSetup()))),button('Cancelar estudo','power','button button-quiet',control=>action(control,()=>refresh(()=>api.cancelBenchmarkSetup())))));
    return panel;
  }
  function renderBenchmarkContext(context){const box=el('div','benchmark-context');if(!context)return box;
    if(context.collectorInterrupted)box.append(el('p','field-help','Coleta recuperada após interrupção. Foco contínuo não validado; repita a medição antes de concluir ganhos.'));
    box.append(el('p','field-help',`${context.type==='baseline'?'Antes':'Depois'} · ${context.hardware?.cpu||'CPU não identificada'} · ${context.hardware?.gpu||'GPU não identificada'}`));
    if(context.tuningNote)box.append(el('p','field-help',`Anotação informada por você: ${context.tuningNote}`));
    if(context.memory)box.append(el('p','field-help',`RAM: ${context.memory.moduleCount} módulos · ${(context.memory.configuredClocksMHz||[]).map(value=>value===null?'Frequência não informada':numberText(value)+' MHz (SMBIOS)').join(' / ')}. XMP/EXPO não confirmado.`));
    box.append(el('p','field-help',context.stability?.available?`WHEA durante o teste: ${context.stability.count} eventos. Ausência de eventos não comprova estabilidade.`:'WHEA indisponível nesta medição.'));
    if(context.powerPlan)box.append(el('p','field-help',context.powerPlan==='unknown'?'Plano de energia: indisponível.':'Plano de energia registrado: '+context.powerPlan+'. Mantido durante esta medição.'));
    if(context.frametimes)box.append(frameSummary(context.frametimes));
    return box;
  }
  function renderBenchmarkRunner(){
    const panel=el('section','panel content-card benchmark-runner');append(panel,el('h2','','Benchmark acompanhado'),el('p','settings-description','O CSBOOST solicita o mapa CS2 FPS BENCHMARK DUST2 e acompanha somente o novo log. O teste precisa iniciar dentro do mapa; mantenha o CS2 em primeiro plano até o relatório terminar.'));
    loadPage('benchmarkInstallation','inspectBenchmarkRun');loadPage('benchmarkRun','getBenchmarkRun');loadPage('engine','getEngineAssessment');
    if(dataErrors.benchmarkInstallation)panel.append(errorBox(dataErrors.benchmarkInstallation));
    const installation=data.benchmarkInstallation;append(panel,el('p','field-help',installation?installation.map.installed?'Arquivos locais do mapa encontrados. A execução será confirmada pelo log.':'O mapa não foi encontrado nas bibliotecas Steam. Inscreva-se na Oficina e aguarde o download.':'Verificando mapa nas bibliotecas Steam…'),append(el('div','button-row'),button('Abrir mapa na Oficina','external','button button-secondary',control=>action(control,()=>api.openBenchmarkWorkshop())),pageRefresh('benchmarkInstallation','inspectBenchmarkRun')));
    if(installation?.fpsLimit)panel.append(el('p','field-help',installation.fpsLimit.available?`Limite atual: ${installation.fpsLimit.current}. Será salvo antes da medição e restaurado depois que o CS2 fechar.`:installation.fpsLimit.reason||'O limite de FPS precisa ser identificado antes do teste.'));
    const run=data.benchmarkRun,active=run&&['preparing','waiting-for-game','loading-map','in-map','measuring','saving','cleaning','waiting-for-game-close','recovery-required'].includes(run.status);
    if(run){const label={preparing:'Preparando', 'waiting-for-game':'Aguardando o CS2','loading-map':'Aguardando o mapa','in-map':'Mapa carregado','measuring':'Medição em andamento','saving':'Salvando resultado','cleaning':'Restaurando ajustes','waiting-for-game-close':'Resultado salvo. Feche o CS2 para restaurar o limite de FPS.',completed:'Concluído',cancelled:'Cancelado',failed:'Falhou','recovery-required':'Restauração pendente'}[run.status]||run.status;panel.append(el('p','',label));if(run.error)panel.append(errorBox(run.error.message));if(run.cleanupError)panel.append(errorBox(run.cleanupError));if(run.status==='measuring'){const progress=el('progress');progress.max=1;progress.value=run.progress||0;append(panel,progress,el('p','field-help',`${Math.floor(run.elapsedSeconds||0)} segundos observados. A barra não é um resultado de FPS.`));}if(run.result)panel.append(el('p','success-text',`FPS médio: ${numberText(run.result.averageFps)} · 1% low: ${numberText(run.result.onePercentLow)}.`));}
    if(active)panel.append(button('Cancelar e restaurar benchmark','power','button button-secondary',control=>action(control,async()=>{data.benchmarkRun=await api.cancelBenchmarkRun();render();},'Cancelamento solicitado. O jogo continua aberto até você fechar.')));
    else{
      panel.append(renderProcessPolicy(),renderMeasurementSettings());const noteInput=el('input','native-select');noteInput.maxLength=300;noteInput.value=benchmarkTuningNote;noteInput.placeholder='Ex.: antes, sem mudar PBO/CO';noteInput.setAttribute('aria-label','Anotação de PBO/CO e memória informada pelo usuário');noteInput.addEventListener('input',()=>{benchmarkTuningNote=noteInput.value;});append(panel,append(el('label','comparison-field'),el('span','field-label','Anotação de PBO/CO e memória (informada por você)'),noteInput));const row=el('div','button-row'),mode=el('select','native-select');mode.setAttribute('aria-label','Energia do benchmark otimizado');for(const [value,label]of [['balanced','Antes e Depois: manter plano atual']]){const option=el('option','',label);option.value=value;mode.append(option);}
      for(const [type,label]of [['baseline','Medir antes'],['boosted','Medir depois']]){const start=button(label,'play','button button-primary',control=>action(control,async()=>{data.benchmarkRun=await api.startBenchmarkRun({type,preset:type==='baseline'?'balanced':mode.value,processPolicy:type==='baseline'?{prioritizeGame:false,backgroundApps:[]}:sessionProcessPolicy,tuningNote:benchmarkTuningNote});render();},'Medição solicitada à Steam. Confirme o início dentro do mapa.'));start.disabled=!installation?.map.installed||installation?.fpsLimit?.available===false;row.append(start);}append(row,mode);panel.append(row);
    }
    append(panel,el('p','field-help','Para avaliar PBO/CO, faça a medição Antes, ajuste no Ryzen Master e faça a medição Depois, mantendo gráficos e os demais ajustes iguais. Para isolar PBO/CO, mantenha o plano atual e as prioridades desmarcadas.'),el('p','field-help','O teste usa FPS sem limite. Ao terminar, feche o CS2; o limite anterior será restaurado no arquivo de configuração, preservando outras mudanças.'));
    return panel;
  }
  function renderComparisonStats(target,value){
    const signed=n=>(n>0?'+':'')+numberText(n);
    if(value.before.frametimes||value.after.frametimes){for(const [label,group]of [['Antes',value.before],['Depois',value.after]])append(target,el('h3','',label+' · quadros detalhados'),frameSummary(group.frametimes));}
    if(!value.before.dispersion||!value.after.dispersion){target.append(el('p','field-help','Comparação antiga: exporte novamente ou refaça a comparação para mostrar dispersão e faixas.'));return;}
    if(value.before.runs===1&&value.after.runs===1){
      for(const[key,label]of [['averageFps','FPS médio'],['onePercentLow','1% low (P1)']])append(target,el('h3','',label),details([['Antes',numberText(value.before[key])+' FPS'],['Depois',numberText(value.after[key])+' FPS'],['Diferença observada',value[key].percent===null?'Percentual indisponível':signed(value[key].percent)+'%']]),el('p','field-help',value[key].conclusion));
      for(const warning of value.warnings)target.append(el('p','field-help',warning));return;
    }
    for(const[key,label]of [['averageFps','FPS médio'],['onePercentLow','1% low (P1)']]){
      const before=value.before.dispersion[key],after=value.after.dispersion[key],delta=value[key];
      const stats=(group,dispersion)=>numberText(group[key])+' FPS · faixa '+numberText(dispersion.minimum)+'–'+numberText(dispersion.maximum)+' · IQR '+numberText(dispersion.iqr)+' · MAD '+numberText(dispersion.mad);
      append(target,el('h3','',label),details([['Antes (mediana)',stats(value.before,before)],['Depois (mediana)',stats(value.after,after)],['Diferença entre medianas',delta.percent===null?'Percentual indisponível':signed(delta.percent)+'% · faixa descritiva '+signed(delta.percentRange.minimum)+'% a '+signed(delta.percentRange.maximum)+'%']]),el('p','field-help',delta.conclusion));
    }
    target.append(el('p','field-help','IQR: amplitude dos quartis 25%–75%. MAD: mediana dos desvios absolutos em relação à mediana. Faixas descritivas usam os extremos observados; não estabelecem significância estatística.'));
  }
  function renderComparison(reports){
    const panel=el('section','panel content-card comparison-panel');append(panel,el('h2','','Comparar medições'),el('p','settings-description','Selecione as execuções de cada grupo (Ctrl permite selecionar várias). A mediana reduz a influência de uma execução atípica.'));
    const columns=el('div','settings-grid');
    for(const [key,label]of [['baselineIds','Antes do preset'],['optimizedIds','Depois do preset']]){const field=el('label','comparison-field'),select=el('select','native-select');select.multiple=true;select.size=Math.min(5,reports.length);select.setAttribute('aria-label',label);
      for(const report of reports){const option=el('option','',`${report.sourceName} · ${report.averageFps.toFixed(1)} FPS · ${new Date(report.importedAt).toLocaleTimeString('pt-BR')}`);option.value=report.id;option.selected=comparisonSelection[key].includes(report.id);select.append(option);}
      select.addEventListener('change',()=>{comparisonSelection[key]=[...select.selectedOptions].map(option=>option.value);comparison=null;document.getElementById('comparison-result')?.replaceChildren();});append(field,el('span','field-label',label),select);columns.append(field);
    }panel.append(columns);
    const result=el('div');result.id='comparison-result';
    const compare=button('Comparar FPS','performance','button button-primary',control=>action(control,async()=>{comparison=await api.compareBenchmarks(comparisonSelection);render();}));
    append(panel,append(el('div','button-row'),compare),result);
    if(comparison){renderComparisonStats(result,comparison);comparison.warnings.forEach(warning=>result.append(el('p','field-help',warning)));result.append(button('Exportar comparação','download','button button-secondary',control=>action(control,()=>api.exportBenchmarkComparison(comparisonSelection),'Comparação exportada.')));}
    return panel;
  }

  function renderSettings(page) {
    append(page, append(el('div', 'page-heading'), titleBlock('Configurações', 'Sua conta, seus arquivos e seu CSBOOST.', 'DO SEU JEITO')));
    const grid = el('div', 'settings-grid');
    const account = el('section', 'panel settings-panel');
    append(account, panelHeader('steam', 'Conta conectada', state.session?.identitySource==='steam-local'?'Identidade local conferida na Steam deste PC; sem autenticação de servidor.':'Autenticada diretamente pela Steam.'), details([
      ['Steam ID', state.session?.steamId, 'session-id'],
      ['Conectada em', (state.session?.authenticatedAt||state.session?.selectedAt) ? new Date(state.session.authenticatedAt||state.session.selectedAt).toLocaleString('pt-BR') : 'Nesta sessão'],
    ]));
    const logout = button('Sair da conta', 'logout', 'button button-quiet', async control => {
      const accepted = await promptUser({ title: 'Sair do CSBOOST?', description: 'Seus perfis e arquivos continuarão salvos neste computador.', submit: 'Sair da conta', textInput: false });
      if (!accepted) return;
      await action(control, async () => { await api.logout(); await syncAuth(); });
    });
    append(account, append(el('div', 'button-row'), button('Ver perfil Steam', 'external', 'button button-secondary', control => action(control, () => api.openSteamProfile())), logout));
    const files = el('section', 'panel settings-panel');
    append(files, panelHeader('folder', 'Seus arquivos', 'Perfis e configurações neste computador.'), el('p', 'settings-description', 'Os perfis são salvos localmente. Ao aplicar uma configuração, o CSBOOST grava csboost.cfg na pasta do CS2 e guarda uma cópia do arquivo anterior.'), append(el('div', 'button-row'), button('Pasta dos perfis', 'folder', 'button button-secondary', control => action(control, () => api.openFolder('profiles'))), button('Pasta do CS2', 'folder', 'button button-secondary', control => action(control, () => api.openFolder('gameCfg')))));
    const about = el('section', 'panel settings-panel');
    append(about, panelHeader('info', 'Sobre o CSBOOST', 'Um espaço simples para preparar seu jogo.'), details([
      ['Aplicativo', 'CSBOOST'], ['Versão', state.version || '1.0.0'],
    ]), el('p', 'settings-description', 'CSBOOST usa funções próprias e arquivos locais. O login Steam identifica sua conta; seus perfis de configuração ficam neste computador.'), el('p','settings-description','CSBOOST é independente e não é afiliado, endossado nem patrocinado por Valve, Steam, NVIDIA, AMD ou Intel. Nomes e marcas pertencem a seus titulares.'),el('p','settings-description','Esta versão não tem assinatura digital. Antes de abrir um ZIP, confira o SHA-256 publicado no GitHub Releases oficial.'));
    const system = el('section', 'panel settings-panel');
    append(system, panelHeader('monitor', 'Steam e Counter-Strike 2', 'Instalações detectadas no Windows.'));
    if (dataErrors.steam) system.append(errorBox(dataErrors.steam));
    else append(system, details([
      ['Steam', data.steam?.installed ? 'Instalada' : 'Não encontrada'],
      ['CS2', data.steam?.cs2Installed ? 'Instalado' : 'Não encontrado'],
    ]));
    append(system, append(el('div', 'button-row'), button('Verificar instalação', 'refresh', 'button button-secondary', control => action(control, () => refreshPart('steam', 'refreshSteam'), 'Verificação da Steam concluída.'))));
    const mediaSettings=el('section','panel settings-panel');mediaSettings.append(panelHeader('file','Fotos e logos públicos','Consultados sob demanda na fonte indicada.'));
    const mediaToggle=el('input');mediaToggle.type='checkbox';mediaToggle.checked=state.publicationPolicy?.publicMedia===false?false:publicMediaEnabled;mediaToggle.disabled=state.publicationPolicy?.publicMedia===false;mediaToggle.setAttribute('aria-label','Carregar fotos e logos públicos');mediaToggle.addEventListener('change',()=>{publicMediaEnabled=mediaToggle.checked;try{localStorage.setItem('csboost-public-media',publicMediaEnabled?'on':'off');}catch{}render();});append(mediaSettings,append(el('label','checkbox-label'),mediaToggle,document.createTextNode('Carregar fotos e logos de jogadores e times')),el('p','field-help','O carregamento de imagens fica indisponível nesta edição enquanto as permissões de conteúdo são resolvidas.'));
    const support=el('section','panel settings-panel compatibility-panel');
    append(support,panelHeader('shield','Compatibilidade deste PC','Recursos detectados para esta instalação.'),el('p','settings-description','Funciona com CPUs AMD e Intel. Ajustes de driver e firmware dependem dos componentes e permissões deste computador.'));
    loadPage('compatibility','getCompatibility');
    const report=data.compatibility;
    if(dataErrors.compatibility)support.append(errorBox(dataErrors.compatibility));
    else if(!report)support.append(el('p','field-help','Conferindo o computador…'));
    else {append(support,details([['CPU',report.hardware.cpu],['Fabricante',report.hardware.cpuVendor],['GPU',report.hardware.gpu],['Base do aplicativo',report.ready?'Pronta':'Há requisitos a conferir'],['Arquivos do pacote',report.integrity.verified?'Conferidos por SHA-256':'Não verificados nesta execução']]));
      const checks=el('div','compatibility-checks');for(const check of report.checks){const row=el('div','compatibility-check '+(check.ok===true?'is-ready':'needs-check'));append(row,icon(check.ok===true?'check':'info'),append(el('div'),el('strong','',check.title),el('p','field-help',check.detail)));checks.append(row);}support.append(checks);
      const features=el('details','compatibility-features');features.append(el('summary','','Recursos e suporte por hardware'));for(const feature of report.features)append(features,el('p','field-help',feature.name+' · '+({available:'Disponível',unavailable:'Indisponível',assisted:'Assistido'}[feature.mode]||'Não confirmado')+(feature.detail?' — '+feature.detail:'')));support.append(features);
      if(['AMD','Intel'].includes(report.hardware.cpuVendor))support.append(button('Guia oficial de CPU '+report.hardware.cpuVendor,'external','button button-quiet button-small',control=>action(control,()=>api.openHardwareHelp({vendor:report.hardware.cpuVendor}))));
    }
    append(support,append(el('div','button-row'),pageRefresh('compatibility','getCompatibility'),button('Exportar compatibilidade','download','button button-secondary button-small',control=>action(control,()=>api.exportCompatibility(),'Relatório salvo sem ID da conta, caminhos, perfis ou configurações pessoais.'))));
    append(about,append(el('div','button-row'),button('Guia de uso','info','button button-secondary button-small',control=>action(control,()=>api.openQuickGuide())),button('Privacidade','shield','button button-quiet button-small',control=>action(control,()=>api.openPrivacyNotice())),button('Créditos e licenças','file','button button-quiet button-small',control=>action(control,()=>api.openThirdPartyNotices())),button('Criar atalho na área de trabalho','plus','button button-secondary button-small',control=>action(control,()=>api.createDesktopShortcut(),'Atalho desta versão criado.'))));
    append(grid, account, files, about, system,mediaSettings,support); page.append(grid);
  }

  function render() {
    const account=state.session?.steamId||null;
    const samePage=renderedView===currentView&&renderedAccount===account;
    const focused=document.activeElement,focusId=samePage&&focused?.id&&focused.matches('input,select,textarea,.preview-scene')?focused.id:null;
    const motionKey=[account,currentView,currentView==='fps'?data.fpsFlow?.study?.stage:'',currentView==='config'?selectedProfileId:''].join(':');
    const animate=renderedMotionKey!==motionKey&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroll=renderedView===currentView&&renderedAccount===account?(app.querySelector('.workspace')?.scrollTop||0):0;
    app.replaceChildren(state.session ? renderShell() : renderLogin());
    if(state.monitor?.failed){
      const warning=el('section','panel monitor-failure');append(warning,el('h2','','O monitor de sessão parou'),el('p','field-help','Encerre para recuperar os ajustes temporários antes de reabrir o CSBOOST.'));
      const recover=button('Encerrar para recuperar','refresh','button button-secondary',control=>action(control,()=>api.recoverAndQuit()));recover.disabled=!!state.operation?.active||!state.recovery?.available;warning.append(recover);
      (app.querySelector('.page')||app.querySelector('.login-main'))?.prepend(warning);
    }
    const workspace=app.querySelector('.workspace');if(workspace)workspace.scrollTop=scroll;
    renderedView=currentView;renderedAccount=account;
    renderedMotionKey=motionKey;
    if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
    if(animate){const target=app.querySelector('.page')||app.querySelector('.login-main');target?.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});}
    if (state.session && currentView === 'config') updateCrosshair();
    window.CSBoostPreview.sync3D();
    observePublicMedia();
  }

  function startupError(error) {
    app.replaceChildren(append(el('div', 'boot-screen'), append(el('div', 'startup-error'), el('h1', '', 'Não foi possível iniciar o CSBOOST'), el('p', '', errorText(error)), el('p', '', 'Feche o aplicativo e abra novamente pelo CSBOOST.exe.'))));
  }

  document.getElementById('window-minimize').addEventListener('click', () => api?.minimize?.());
  document.getElementById('window-close').addEventListener('click', () => api?.quit?.());
  if (!api) { startupError(new Error('A conexão com o aplicativo não está disponível.')); return; }
  if (typeof api.onAuthChanged === 'function') api.onAuthChanged(() => { syncAuth().catch(error => notify(errorText(error), true)); });
  syncAuth().catch(startupError);
  setInterval(async()=>{if(!state.session&&!state.monitor?.failed)return;try{const next=await api.getState();if(JSON.stringify(state.session)!==JSON.stringify(next.session)){await syncAuth();return;}if(['operation','monitor','profileHealth','recovery'].some(key=>JSON.stringify(state[key])!==JSON.stringify(next[key]))){for(const key of ['operation','monitor','profileHealth','recovery'])state[key]=next[key];render();}}catch{}},1500);
  const stableSession=value=>JSON.stringify(value,(key,item)=>key==='cpuPercent'?undefined:item);
  setInterval(async()=>{if(!state.session||currentView!=='performance')return;try{const previous=data.gameSession;const next=await api.getGameSession();const changed=stableSession(next)!==stableSession(previous);data.gameSession=next;if(previous&&!next)data.lastSessionSummary=await api.getLastSessionSummary();if(changed)render();else if(next?.processReport?.automatic){const report=next.processReport,node=document.querySelector('.cpu-auto-live');if(node)node.textContent='CPU automática · '+(report.cpuPercent===null||report.cpuPercent===undefined?'analisando carga':numberText(report.cpuPercent)+'% de uso')+' · '+(report.totalApplied??0)+' ajustes temporários ativos.';}}catch{}},2000);
  setInterval(async()=>{if(!state.session||currentView!=='fps')return;try{const next=await api.getFpsFlow();const changed=stableSession(next)!==stableSession(data.fpsFlow);data.fpsFlow=next;if(changed)render();}catch{}},2000);
  setInterval(async()=>{if(!state.session||currentView!=='benchmark')return;try{const next=await api.getBenchmarkRun();if(JSON.stringify(next)!==JSON.stringify(data.benchmarkRun)){const saved=!!next?.savedResult&&!data.benchmarkRun?.savedResult,completed=next?.status==='completed'&&data.benchmarkRun?.status!=='completed';data.benchmarkRun=next;if(saved||completed){data.benchmarks=await api.listBenchmarks();delete data.benchmarkSetup;comparison=null;}render();}}catch{}},1000);
})();

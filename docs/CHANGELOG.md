# Histórico de versões

As notas abaixo resumem as mudanças principais em ordem cronológica. O estado e os limites atuais estão no [README](../README.md) e na [documentação de distribuição](DISTRIBUICAO.md).

## 1.18.0

- Prévia interativa de mira, FOV e posição da arma sobre uma cena própria, atalhos do editor e transições com suporte a movimento reduzido. O menu deixou de exibir o fluxo Boost 1 Clique; os boosters passaram a ficar em Desempenho e FPS+.

## 1.21.0

- Retorno ao menu com nove seções e benchmark FPS+ de uma execução Antes e uma Depois. Boosters selecionáveis, compatibilidade de tela cheia experimental desativada por padrão, registro modular, backups v1/v2 e recuperação de sessão.

## 1.22.0

- Pacote portátil, guia, criação de atalho, verificação de integridade, compatibilidade AMD/Intel por recurso, relatório sem dados da conta, histórico local de miras e cópia seletiva de configurações profissionais. Visuais próprios substituíram os materiais extraídos da referência.

## 1.23.0

- Dez boosters selecionáveis e opções adicionais NVIDIA com restauração. Melhorias na recuperação de sessão, identificação de processos, proteção contra arquivos de perfil danificados e validação dos dados públicos em cache.

## 1.24.0

- Fotos públicas de jogadores e logos de equipes carregados sob demanda, miniaturas de mira, prévia de perfil composto e ranking paginado. Os links de elenco passaram a usar identificadores publicados.

## 1.25.0

- Interface reorganizada em preto, branco e grafite, navegação compacta, controles e foco de teclado revisados, textos diretos e etapas do FPS+ identificadas.

## 1.26.0

- O motor passou a selecionar boosters compatíveis automaticamente, mantendo a personalização nas opções avançadas. A sessão de jogo ganhou balanceamento de CPU por carga e restauração de prioridades temporárias. O automático preserva bateria, resolução, limite de FPS, gravação e o plano ativo em Ryzen X3D.

## 1.27.0

- Política de energia compartilhada entre boost, sessão e benchmark, com preservação do plano atual durante a comparação. PresentMon passou a oferecer captura ETW opcional, desativada por padrão, separada dos resultados VProf. A consulta de topologia da CPU é experimental e somente leitura.

## 1.28.5

- A sessão avançada ganhou prioridade de memória baixa manual e por aplicativo de fundo, com leitura, confirmação, registro de restauração e preservação de mudanças externas. A lista de processos também mostra memória em uso.
- A aba Hardware reúne o acompanhamento de PBO/Curve Optimizer, XMP/EXPO e guias oficiais de ajuste de GPU. O CSBOOST não grava clocks, tensões, timings nem configurações de firmware.
- EcoQoS continua fora do gerenciamento automático por decisão de produto: navegadores como Chrome e Edge gerenciam seus próprios modos de eficiência por processo, e uma intervenção do CSBOOST poderia competir com essa política. As APIs do Windows permitem consultar e restaurar o estado; a exclusão não decorre de uma limitação da API.
- A sessão agora amostra o estacionamento de processadores a cada 10 segundos, somente leitura, e a política de energia considera confirmação X3D pela topologia. A preferência de Modo de Jogo só é lida no Windows 11, onde está documentada; em Windows 10 e para o estado efetivo da Xbox Game Bar, permanece desconhecida. O resumo não presume CCD preferido nem local de execução do CS2; a validação física em X3D de dois CCDs e Intel híbrida segue pendente.

## 1.30.0 (candidata de publicação)

- Consolidadas as tarefas T1–T15: restauração com conflitos, inventário de processos limitado, política anti-oscilação, auditoria somente leitura, detecção de governadores externos, histórico e resumo de sessão. A matriz abaixo registra o estado de cada tarefa.
- O classificador PresentMon e as recomendações T14 continuam experimentais e somente leitura; não escolhem boosters, não aplicam ajustes e não prometem ganho de FPS. Topologia X3D, medição, ETW e compatibilidade de hardware ainda exigem validação física adicional.
- Radeon e Intel continuam com orientação oficial; o CSBOOST não grava parâmetros privados de driver. A preferência gráfica do Windows e os ajustes reconhecidos pela NVAPI permanecem restauráveis e limitados ao que o driver confirma.
- O código original do CSBOOST passa à licença MIT. Marcas e componentes de terceiros mantêm seus direitos e termos. Consulte [NOTICE](../NOTICE) e [FONTES-DE-DADOS.md](FONTES-DE-DADOS.md); a revisão de termos das fontes públicas continua sendo uma condição para divulgação do catálogo.
- A T7 (assinatura digital) permanece pendente por decisão do responsável; esta candidata é unsigned. O pacote fornece instruções para comparar o SHA-256 divulgado no GitHub Releases. A T16 (laboratório A/B repetido) continua fora do escopo.
- A verificação desta candidata e as limitações observadas estão em [VERIFICACAO-1.30.0.md](VERIFICACAO-1.30.0.md); combinações de hardware estão em [COMPATIBILIDADE.md](COMPATIBILIDADE.md). Não anunciar compatibilidade além do que esses documentos validam.

### Revisão antes da publicação — 21/10/2026

- Corrigida a gravação do diário compartilhado para repetir bloqueios temporários de arquivo do Windows por prazo curto, preservando o estado anterior e interrompendo a operação se outra aplicação alterar o arquivo.
- Recuperação de shaders em conflito pode ser encerrada com confirmação nativa e token de uso único; caches e recibo de auditoria são preservados.
- O aviso de versão sem assinatura agora permanece visível na entrada; uma regra legada escondia o texto apesar de ele existir no documento. Testes verificam visibilidade e enquadramento.
- O pacote preserva a licença original do Electron separada da licença MIT do CSBOOST. Créditos passam a reunir todos os componentes e fontes.
- Configurações permite desligar novas solicitações de fotos/logos públicos. Nomes longos de perfis deixam de quebrar em fragmentos na janela mínima e mantêm nome completo acessível.
- Empacotamento exige evidências atuais da suíte e da interface; verificações antigas ou de outro código não aprovam uma nova candidata. O verificador de inicialização também recusa relatórios ausentes ou antigos.
- Resultado e pendências de cada etapa P1–P11 constam da [revisão antes da publicação](REVISAO-PRE-PUBLICACAO-1.30.0.md). O relatório não libera a divulgação pública.

### Continuação local — 22/10/2026

- Corrigido o catálogo do auxiliar NVAPI para aceitar os controles granulares fixos do app e Ultra, mantendo a recusa de IDs e valores arbitrários. A opção de baixa latência pode criar override quando reconhecida pelo driver; controles que exigem um efeito existente continuam protegidos.
- Acrescentado teste do catálogo no assembly compilado e verificador explícito de aplicação/restauração real em NVIDIA.
- Corrigido o envio de valores ao auxiliar do Registro: o metadado de existência do backup não é mais enviado como dado gravável. A validação de destinos e tipos permanece fechada.
- Preparados Git local, retenção de evidências do CI e solicitações de autorização das fontes. Resultados e limites em [ETAPAS-LOCAIS-2026-10-22.md](ETAPAS-LOCAIS-2026-10-22.md).

### Tarefa → versão e situação

| Tarefa | Versão | Situação registrada |
|---|---|---|
| T1 — conflitos de restauração | 1.30.0 | Implementada; cache de shaders revisado nesta candidata |
| T2 — CI em checkout limpo | 1.30.0 | Workflow multiplataforma corrigido; execução remota ainda pendente |
| T3 — documentação | 1.30.0 | Versão, changelog e checagem de completude |
| T4 — inventário e limites | 1.30.0 | Implementada; `cs2.exe` de outra instalação ainda requer validação adicional |
| T5 — anti-oscilação | 1.30.0 | Implementada; limiares são heurísticas |
| T6 — verificação Windows | 1.30.0 | Evidência local registrada; não substitui validação em outras máquinas |
| T7 — assinatura | 1.30.0 | Pendente; distribuição sem assinatura |
| T8 — reduzir PowerShell | 1.30.0 | Implementada; chamadas restantes são limitadas e documentadas |
| T9 — saúde X3D | 1.30.0 | Parcial; campos sem fonte confiável continuam desconhecidos |
| T10 — ajustes externos | 1.30.0 | Implementada, somente leitura |
| T11 — conflitos externos | 1.30.0 | Parcial; somente processos com identificação confirmada |
| T12 — transparência | 1.30.0 | Implementada; exportação sanitiza chaves e valores sensíveis |
| T13 — gargalo | 1.30.0 | Implementada como diagnóstico experimental |
| T14 — recomendações | 1.30.0 | Implementada como recomendação, sem aplicação automática |
| T15 — resumo pós-sessão | 1.30.0 | Implementada; ETW em FACEIT/Gamers Club não validado |
| T16 — laboratório A/B repetido | — | Fora do escopo por decisão do responsável |

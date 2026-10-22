# Revisão antes da publicação — CSBOOST 1.30.0

Atualização posterior: a [continuação de 22/10/2026](ETAPAS-LOCAIS-2026-10-22.md) registra a correção adicional NVIDIA e os testes reais. Os resultados e o hash abaixo documentam a rodada anterior de 21/10/2026.

Data: 21/10/2026. Base: plano de publicação enviado pelo responsável e candidata local 1.30.0. **Ainda não liberada para publicação pública.** As correções de código e apresentação abaixo estão preparadas para revisão; os aceites externos continuam abertos.

## O que foi revisado

Plano completo P1–P11, requisitos das Fases C/D, matriz T1–T16, documentação, configuração de CI, licenças, composição do pacote, inicialização, IPC, validação de entradas, perfis/configurações, Boost, backups/restauração, cache de shaders, abertura de ferramentas, fontes públicas e fluxos da interface. A revisão combinou leitura dos caminhos críticos com testes existentes e novos; não equivale a leitura exaustiva de cada linha de cada dependência, pentest ou certificação de segurança.

O computador de revisão é Windows 10 Home 19045, Ryzen 5 5600 e RTX 4060 (driver 32.0.16.1062). Não foi alterada nenhuma configuração real do jogo, driver, navegador ou firmware. A evidência e todos os skips estão em [VERIFICACAO-1.30.0.md](VERIFICACAO-1.30.0.md).

## Problemas encontrados e corrigidos

| Achado | Correção e evidência |
|---|---|
| A MIT própria sobrescrevia o aviso original do Electron | `tools/build-free.cjs` preserva `LICENSE-Electron.txt`; `distribution-package.cjs` exige seu conteúdo original e os avisos. `NOTICE` e `docs/CREDITOS.md` incluem PresentMon e demais componentes; o botão do app abre os créditos completos |
| Testes antigos poderiam sustentar um pacote de código alterado | `test-suite.cjs`, `test-ui.cjs` e `verification-evidence.cjs` registram a impressão dos arquivos; a auditoria exige evidências atuais e o log correspondente. Os relatórios de QA não são certificados assinados e continuam dependentes do ambiente de build |
| Verificação poderia aceitar relatório anterior de inicialização | `verify-free.cjs` remove a saída anterior, exige saída recente, sucesso do processo e integridade confirmada |
| Bloqueio temporário do Windows deixou o diário do Boost pendente após restaurar valores | `owned-state.mjs` faz tentativas limitadas, preserva o arquivo anterior e aborta se houver alteração externa. `owned-state.test.mjs` cobre falha temporária, persistente e concorrência; não remove o destino como contorno |
| Shaders em conflito não ofereciam encerramento seguro da recuperação | `shader-cache.mjs`, `controller.mjs`, preload e renderer acrescentam confirmação, token único e recibo de caminhos. Todos os caches ficam preservados. `free-shader-cache.test.mjs` e `free-restore-conflicts.test.mjs` cobrem a ação e o cancelamento |
| Não havia controle para desligar imagens públicas | Preferência local em Configurações bloqueia novas solicitações/exibição, preserva as iniciais e informa cache/requisições já iniciadas. `distribution-ui-scenario.cjs` verifica a preferência |
| Aviso unsigned estava no DOM, mas era ocultado por regra legada de login | `style.css` preserva o aviso; o harness exige dimensão, visibilidade e enquadramento em 1400×864 e 960×640, além de capturas |
| Nomes de perfis quebravam em pequenos fragmentos na janela mínima | `premium.css` e `app.js` mantêm linha única com reticências e nome completo no tooltip e na identificação acessível; `layout-ui-scenario.cjs` cobre 960 px |
| Ferramentas antigas da experiência com a instalação CSCLIENT ainda estavam na fonte ativa | O bootstrap e sete ferramentas sem uso no fluxo atual foram movidos para `docs/historico/scripts/origem-inicial/`; não entram na fonte candidata para publicação nem no app |
| Documento de dependências ainda citava 1.28 e uso pessoal | `docs/DEPENDENCIAS.md` atualizado para 1.30.0, MIT e aviso Electron separado |
| Manual contradizia o código sobre extras NVIDIA automáticos | `docs/DISTRIBUICAO.md` corrigido: os três extras de filtragem ficam fora do automático |
| Documento de fontes citava domínio diferente como possível permissão | Removida a referência indevida a prosettings.com. A disponibilidade de ProSettings.net não comprova autorização para reutilizar dados ou imagens |
| Fixture da UI observava operações de cache ainda incompletas | O cenário agora aguarda estado ativo e restauração concluída, evitando tratar journal criado ou arquivo reaparecido como término da ação |

## Plano, item por item

| Item | Estado e arquivos principais | Aceite ainda pendente |
|---|---|---|
| P1 — testes/CI | Fixtures portáveis de GPU/Discord corrigidas. `.github/workflows/test.yml` exige instalação correta do Electron e execução real da UI. Suíte Windows local passou, com sete skips individualizados | Executar checkout limpo em Ubuntu e Windows hospedados; executar os casos de symlink com privilégio disponível |
| P2 — versão/docs | `package.json`, README, FREE-EDITION, changelog e `check-docs.mjs` coerentes em 1.30.0; fixtures de documentação incompleta cobertas | Nenhum problema local remanescente identificado neste aceite |
| P3 — evidência Windows | Ficha `VERIFICACAO-1.30.0.md` acompanha fonte e app; contém comandos, resultados, skips e limites | Não existe commit/repositório remoto nesta cópia; publicação da evidência junto ao código continua futura |
| P4 — MIT/fontes/créditos | MIT escolhida e aplicada; não afiliação no app/README/NOTICE; créditos completos e opt-out de mídia; termos e fontes inventariados | Resolver permissão/condições de ProSettings, fotos/logos, dataset Valve e aplicabilidade dos termos Steam ao uso efetivo. Direitos sobre o nome/marca não foram certificados |
| P5 — unsigned/hash | Aviso na entrada e instruções de SHA-256. ZIP/sidecar/metadados e texto de release preparados localmente. Assinatura permanece pendente por decisão do responsável | Publicar hash no README/GitHub Releases; análise de falso positivo do Defender após cada release, com registro. Nenhum envio externo foi realizado |
| P6 — shaders | Restauração parcial, preservação de caches novos, bloqueio de journal adulterado e saída confirmada com auditoria | Teste físico adicional de cache com Steam/CS2 fechado; nenhum arquivo real foi movido nesta revisão |
| P7 — navegador | Políticas avançadas, confirmação, leitura de políticas de máquina, restauração e conflitos cobertos por fixtures; referências oficiais em FONTES-DE-DADOS | Aplicar/observar/restaurar em Chrome e Edge reais, conferindo a página de políticas e o efeito após reinício |
| P8 — NVIDIA | Exclusão On/Ultra no Boost, aviso Reflex/Ultra e relações VSync/buffer/API documentadas. Nenhum módulo novo virou automático | Aplicar e restaurar o perfil em NVIDIA real, registrar driver e resultado; não há promessa de ganho |
| P9 — Adrenalin | Caminho, assinatura e SHA-256 são novamente consultados antes da abertura; testes simulam mudança e falham fechado | A pequena janela entre conferir e abrir permanece; não há handle de execução exclusivo. Hardware AMD não disponível |
| P10 — higiene/segurança | Revisões e scripts antigos movidos ao histórico; raiz atual limpa; SECURITY.md, `.gitignore` e formulário de issue presentes; pacote examinado para dados de teste/pessoais | Configurar repositório oficial e canal privado real de segurança; histórico local de revisões não foi publicado |
| P11 — exportação | `change-history.mjs` e testes filtram chaves e valores pessoais (caminhos, identificadores e e-mails). Compatibilidade não inclui identidade/caminhos | CFG e perfis portáteis preservam texto escolhido pelo usuário; essa limitação está expressa em PRIVACIDADE.md. Não compartilhar arquivos brutos de perfil/backups como relatório |
| Fase C — validação física | Matriz separa alvo, simulação, inventário e execução somente leitura; relato anterior em RTX 2060 SUPER não homologa esta candidata | Windows 10 e 11 com NVIDIA aplicando/restaurando os fluxos em PC de teste; outras combinações seguem não validadas |
| Fase D — entrega | ZIP extraído em pasta com espaços e acento: 217 arquivos conferidos, nenhuma divergência; duas inicializações somente leitura aprovadas. Manifesto do app com 130 arquivos. Guias, notas sem promessa de FPS, anti-cheat e suporte preparados | Revisar aceites abertos acima e só então publicar |

T9 continua parcial com campos `unknown` quando não há fonte confiável. T11 reconhece apenas processos com nome confirmado. Rede é diagnóstico, AMD/Intel continuam guias, firmware é assistido. T7 permanece pendente e T16 continua fora do escopo por decisão do responsável. Não foi implementada cópia de código, serviço privado ou materiais extraídos do CSCLIENT.

## Revisão visual

As nove páginas foram capturadas e verificadas em 1400×864, 1100×740 e 960×640, sem rolagem horizontal. Mantidos preto, branco e grafite; fotos, cena do jogo e estados de funcionamento conservam cores próprias. Corrigidos aviso de entrada escondido e nomes/datas de perfis estreitos; miniaturas menores liberam texto na janela mínima. Reticências preservam nomes completos por tooltip e identificação acessível.

A inspeção incluiu navegação, foco de teclado, contraste dos controles cobertos pela suíte, movimento reduzido, prévia compartilhada e perda/recriação do contexto 3D. Não foram identificados outros bloqueios visuais nos cenários executados. Uma janela pequena exige rolagem vertical, prevista no layout. As telas de QA usam identidade e números simulados; **não representam ganho de FPS medido**.

Capturas: [entrada mínima](review-images/entrada-960.png), [editor mínimo](review-images/editor-960.png), [configurações](review-images/configuracoes-960.png), [nove páginas em 960 px](review-images/visual-960.png) e [nove páginas em 1400 px](review-images/visual-1400.png).

O controle nativo de computador recusou a autorização para operar CSBOOST e não informou outro motivo. A revisão utilizou a janela Electron do harness de testes com sistema/identidade simulados e captura das páginas. Isso permite conferir o layout e o fluxo, mas não substitui o teste final do aplicativo oficial no computador do responsável. Login real, escala de tela/DPI diferente, leitor de tela e navegação completa por usuário humano não foram homologados.

## Fontes externas e limites

As consultas públicas de catálogo, notícias e ranking responderam nesta data; dados conservam a data da publicação original (o ranking consultado é de 05/10/2026). Não foram aplicados perfis profissionais ao jogo. A análise de termos consultou páginas oficiais, mas não obteve concessão geral de reutilização dos conteúdos. Consulte [FONTES-DE-DADOS.md](FONTES-DE-DADOS.md) e [PRIVACIDADE.md](PRIVACIDADE.md).

Não houve benchmark real, medição térmica ou de latência, teste de anti-cheat, execução Ubuntu, autenticação Steam real, auditoria independente de dependências ou confirmação de marca. A execução automatizada não garante ausência de defeitos; os riscos conhecidos permanecem descritos na matriz.

## Próximos aceites antes da postagem

1. Colocar esta fonte em repositório e executar o CI Windows/Ubuntu em checkout limpo, com logs e skips revisados.
2. Registrar aplicação/restauração em Windows 10 e 11 com NVIDIA, além de Chrome/Edge reais, em máquina de teste.
3. Resolver e documentar condições de reutilização dos dados, fotos e logos; se a permissão não existir, ajustar/remover a integração correspondente antes da divulgação.
4. Revisar o pacote exato, disponibilizar o SHA-256 no README e no texto do GitHub Release e cumprir o registro de análise do Defender previsto no plano.

Nenhum arquivo obrigatório do plano ficou faltando para a revisão local. O que falta é infraestrutura/ambiente de validação e evidência externa; não é tratado como teste aprovado. As escolhas MIT, GitHub Releases e distribuição sem assinatura foram preservadas. Não houve publicação, upload para terceiros ou mensagem ao Claude.

## Identificação da entrega revisada

- Build: `CSBOOST-Free-130-Reviewed`, versão 1.30.0.
- ZIP Windows x64: `CSBOOST-1.30.0-Windows-x64.zip`, 166349993 bytes.
- SHA-256 do ZIP: `7047765a5cf10a33cf666817fa469d9249afbc6e4485ecc39f06f5811c3535e4`. Este valor está preparado localmente; não foi publicado em canal externo.
- Evidência resumida para auditoria: [EVIDENCIAS-1.30.0.json](EVIDENCIAS-1.30.0.json).

A fonte e as capturas de QA acompanham o pacote de auditoria separado. O ZIP executável contém os guias de uso, privacidade, compatibilidade, créditos e verificação; não inclui fixtures, screenshots de QA, perfis ou arquivos do computador de revisão.

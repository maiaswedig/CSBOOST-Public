# Fontes públicas, marcas e termos externos

Revisão técnica da candidata 1.30.0 — 21/10/2026. Este inventário não é parecer jurídico. A licença MIT do código próprio não concede direitos sobre dados, marcas ou materiais de terceiros.

| Fonte | Uso no CSBOOST | Referência e condição |
|---|---|---|
| ProSettings.net | Catálogo público de jogadores, equipes, configurações, fotos e logos consultados sob demanda. | [Site](https://prosettings.net/) e [aviso de privacidade](https://prosettings.net/privacy-policy-and-affiliate-disclosure/). O [aviso legal oficial](https://prosettings.net/legal-notice/) consultado em 22/10/2026 exige consentimento escrito prévio para reproduzir informações/dados, textos e imagens. A política de privacidade não substitui essa autorização. Obter confirmação dos termos e revisar atribuição/uso de imagens antes de publicar; informações de outro domínio com nome semelhante não servem como autorização. |
| Steam / Valve | OpenID escolhido pelo usuário e notícias públicas do CS2. | [Steam Web API Terms](https://steamcommunity.com/dev/apiterms) e [documentação Steam Web API](https://steamcommunity.com/dev). Os termos publicados descrevem condições para Steam Data, política de privacidade, ausência de afiliação e restrições contra vantagem competitiva injusta; a página informa atualização em julho de 2010. Confirmar a aplicabilidade ao endpoint de notícias sem chave e ao fluxo OpenID; não embutir chave de API de terceiros. |
| Valve Regional Standings no GitHub | Ranking público consultado em tempo de execução. | [Repositório oficial](https://github.com/ValveSoftware/counter-strike_regional_standings). A página consultada não identifica uma licença de dados. A candidata não inclui um espelho do dataset. Confirmar termos e tratamento de cópias/cache antes de distribuir ranking ou arquivos derivados. |
| NVIDIA, AMD, Intel e Microsoft | Documentação e links de suporte exibidos nos guias técnicos. | Marcas e materiais permanecem com seus titulares; o app não sugere endosso. Referências técnicas estão em [Fontes e conflitos de drivers](FONTES-DE-DADOS.md#referências-técnicas). |
| Componentes de software | Electron, Chromium, PresentMon, Inter, NVAPI, codec de sharecode e bibliotecas de prévia. | Créditos, proveniência, licenças e cópias distribuídas estão em [NOTICE](../NOTICE), [DEPENDENCIAS](DEPENDENCIAS.md) e nos avisos incluídos no pacote. |

## Referências técnicas

- [Política Chrome Background Mode](https://chromeenterprise.google/policies/#BackgroundModeEnabled): desativá-la impede apps de fundo após fechar o Chrome; pode interromper tarefas em segundo plano.
- [Política Edge BackgroundModeEnabled](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/backgroundmodeenabled): descreve processos e aplicativos mantidos ativos depois de fechar a janela.
- [Política Edge StartupBoostEnabled](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/startupboostenabled): controla início e reinício de processos Edge em segundo plano.
- [Referência oficial do Painel NVIDIA](https://www.nvidia.com/content/Control-Panel-Help/vLatest/en-us/mergedProjects/3D%20Settings/Manage_3D_Settings_%28reference%29.htm): VSync e buffer triplo têm comportamentos dependentes do modo/API; buffer triplo é documentado para OpenGL.
- [Guia de latência NVIDIA](https://www.nvidia.com/en-gb/geforce/guides/system-latency-optimization-guide/) e [documentação Reflex](https://developer.nvidia.com/performance-rendering-tools/reflex): o guia recomenda Reflex quando disponível e informa que Reflex ativo substitui a função Ultra Low Latency do driver. O CSBOOST não presume que combinar controles produza benefício adicional.

## Verificação técnica em 21/10/2026

A consulta ao catálogo público retornou 100 jogadores, com prévias de configurações de donk, m0NESY e FalleN; as notícias oficiais retornaram 20 itens e o ranking retornou 380 equipes, com publicação datada de 05/10/2026. Disponibilidade técnica não comprova permissão de reutilização nem atualidade além da data informada pela fonte. Não houve importação dessas configurações para o jogo.

Em Configurações → Fotos e logos públicos, o usuário pode desligar novas solicitações de imagens. Requisições já iniciadas podem terminar e o cache anterior não é apagado; a preferência impede sua exibição e novos carregamentos na interface. Catálogo, notícias e rankings têm consultas próprias e continuam disponíveis.

## Condições para divulgação pública

1. Confirmar por escrito ou por termos aplicáveis que a consulta e apresentação de dados ProSettings estão permitidas; incluir atribuição onde exigida e revisar direitos das imagens.
2. Revisar a aplicação dos termos Steam/Valve ao uso efetivo. A política local de privacidade está em [PRIVACIDADE.md](PRIVACIDADE.md), mas precisa ser comparada aos termos atuais e ao fluxo final.
3. Resolver a licença/atribuição do dataset de ranking da Valve e manter o ZIP sem cópia integral do conteúdo até essa confirmação.
4. Revisar o aviso de marcas, as licenças de componentes e os materiais da prévia antes do primeiro release público.

Até resolver esses itens, 1.30.0 é candidata local para auditoria, não anúncio de lançamento público.

## Atualização da revisão em 22/10/2026

O aviso legal identifica a Wloka Digital GmbH e exige autorização escrita prévia para a reprodução de conteúdo. Desligar fotos/logos, manter crédito ou obedecer robots.txt não concede essa autorização. Em 22/10/2026 foi enviada à Wloka Digital, pelo contato indicado no aviso legal, uma solicitação delimitada para os perfis de CS2, cache local e imagens. Em 22/10 também foi aberta a issue [#50 da Valve](https://github.com/ValveSoftware/counter-strike_regional_standings/issues/50) pedindo termos para exibir rankings datados. Ambas aguardam resposta; não há autorização recebida. Os textos e o registro estão em [SOLICITACOES-DE-PERMISSAO.md](SOLICITACOES-DE-PERMISSAO.md).

O [robots.txt](https://prosettings.net/robots.txt) restringe endpoints e arquivos ZIP de configurações; o CSBOOST não deve adicionar consulta a esses arquivos. Isso é orientação de acesso, não licença de conteúdo. O repositório Valve consultado continua sem licença de dados identificada.

A [documentação oficial de autenticação Steam](https://partner.steamgames.com/doc/features/auth#openid) descreve OpenID e o recebimento do SteamID sem interceptar a senha. Isso sustenta a escolha técnica, mas não representa aprovação da aplicação desktop nem de seu uso específico das APIs/dados. Os termos Steam Web API continuam sujeitos à revisão do responsável; não foi solicitado ou embutido um API key.

## Política da candidata após auditoria

ProSettings, fotos/logos, ranking e notícias estão desativados no processo principal desta candidata. Os serviços de extração não são instanciados; as telas abrem somente links oficiais no navegador. O cache antigo não é lido e pode ser limpo por ação do usuário. As descrições acima documentam integrações anteriores, não recursos ativos desta edição.

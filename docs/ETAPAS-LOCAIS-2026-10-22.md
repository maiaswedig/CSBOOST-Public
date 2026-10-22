# Etapas neste computador — 22/10/2026

Continuação da [revisão da candidata](REVISAO-PRE-PUBLICACAO-1.30.0.md). A versão continua 1.30.0, sem publicação pública. Este relatório registra os resultados locais e o andamento da licença para publicar.

## Concluído nesta máquina

- Defender local habilitado, assinaturas 1.461.143.0: varredura da candidata final atualizada sem detecções. A varredura usa o modo oficial `-DisableRemediation` somente para não apagar arquivos de teste; não desliga a proteção nem altera exclusões. Isso não substitui a análise externa de falso positivo da Microsoft.
- Inventário real da NVAPI: RTX 4060, driver 610.62 (Windows 32.0.16.1062), perfil exclusivo do CS2 e 20 controles reconhecidos.
- Encontrado e corrigido erro do catálogo nativo: controles granulares em modo custom e baixa latência Ultra eram oferecidos pelo JavaScript, mas recusados pelo auxiliar compilado. A primeira tentativa foi recusada antes da gravação; o diário preparado foi recuperado com confirmação de que o driver não mudou.
- Depois da correção, uma alteração real de baixa latência On para Ultra foi aplicada com CS2 fechado e restaurada; o snapshot completo dos 20 controles e a identidade/contagem do perfil voltaram exatamente ao original. Não houve jogo aberto, benchmark ou medição de FPS. Isso valida esse caminho de aplicação/restauração, não todos os presets ou comportamento durante o jogo.
- Cache de shaders real: dois arquivos, 55.130 bytes, foram movidos para a quarentena própria do app e restaurados. A impressão SHA-256 dos caminhos, tamanhos e conteúdos voltou exatamente ao original; não há restauração pendente. O CS2 ficou fechado.
- Novo teste `nvidia-native-catalog.test.mjs` executa a validação do catálogo no assembly C# compilado, por reflexão, sem acessar GPU. Confere todos os valores fixos do catálogo nos cinco presets, Ultra e recusas de IDs/valores/presets inválidos/duplicados. Linux informa explicitamente que esse teste requer Windows/.NET.
- Corrigido outro erro de integração: o adaptador de Registro enviava ao auxiliar o campo `exists`, que serve ao diário e é recusado pelo protocolo nativo. O adaptador agora envia somente `type` e `data`; regressão coberta por `free-windows-tuning.test.mjs`. Depois da correção, o teste de políticas Chrome/Edge tentou aplicar os três valores pelo módulo real do CSBOOST. A resposta nativa confirmou acesso negado à chave HKCU Policies do usuário atual. Os valores originais foram conferidos e o diário foi encerrado sem mudança. As páginas de políticas foram consultadas em perfis novos isolados dos navegadores instalados. **Não há aprovação do efeito ou da aplicação das políticas**; este usuário não conseguiu gravá-las. Não foram alteradas ACLs nem solicitada elevação.
- Criado e confirmado o [repositório privado maiaswedig/CSBOOST](https://github.com/maiaswedig/CSBOOST), após autenticação e conferência da conta escolhida. Fonte ativa enviada; análises, dependências, builds, históricos e dados pessoais ficam excluídos. Não houve release público nem envio ao Claude.
- A licença [MIT](../LICENSE) já permite publicar o **código próprio** do CSBOOST, conforme a escolha anterior. Ela não licencia dados ou imagens de terceiros. Enviei à Wloka Digital GmbH, pelo endereço oficial indicado no aviso legal, um pedido de autorização para leitura, exibição e cache local de perfis CS2; também pedi que confirmem quais direitos de imagens podem licenciar. A resposta está pendente.
- Enviei à Valve a [solicitação de licença do ranking](https://github.com/ValveSoftware/counter-strike_regional_standings/issues/50): exibição da publicação datada, cache local de seis horas, atribuição e nenhum espelho incluído no app. A issue continua aberta, sem resposta. As fontes e o registro dos pedidos estão em [Solicitações de licença e permissão](SOLICITACOES-DE-PERMISSAO.md).

## Reproduzir a verificação NVIDIA

Com CS2 e CSBOOST fechados, sem backup NVIDIA pendente, e com um build atual já verificado:

```powershell
node tools/verify-nvidia-installed.mjs --build CSBOOST-Free-130-Final --apply-restore
```

Esse comando muda realmente um controle fixo do perfil do CS2, guarda o backup no diretório de dados do app e restaura em `finally`. Interrompa se o jogo estiver aberto, houver restauração pendente ou não existir mudança unitária disponível. Se a restauração não for confirmada, preserve o diário e resolva a recuperação antes de aplicar outro ajuste. O resumo compartilhável omite caminhos e identificadores de conta; o arquivo privado fica em analysis, fora do repositório.

## Resultados finais desta rodada

- Testes locais Windows: 902 testes, 895 aprovados, zero falhas, zero cancelados e sete skips por falta de privilégio para criar os links simbólicos das fixtures. A lista individual está em [EVIDENCIAS-1.30.0.json](EVIDENCIAS-1.30.0.json).
- Interface: 107 verificações gerais, dez da prévia 3D e nove de mídia pública real, sem erros do renderer. As rotinas visuais usam identidades e ajustes simulados; as verificações físicas NVIDIA e shaders acima foram executadas separadamente.
- Build `CSBOOST-Free-130-LicenseRequests`: integridade dos 130 arquivos do app confirmada. ZIP extraído: 217 arquivos conferidos, zero divergências e duas inicializações somente leitura aprovadas, sem abrir o jogo ou alterar preferências do usuário.
- ZIP candidato: 166.351.487 bytes; SHA-256 `e7a11a1b07f927eea0662b6be5920c0bf3aaee1ab5786f0fb3b4b1aab6b1607a`. Esse hash está preparado no README e no rascunho local de release; ainda não foi publicado em canal externo.
- Defender local: sem detecções no build final. Nenhum pacote foi submetido à Microsoft e não há reputação SmartScreen ou assinatura do publicador.

## CI remoto aprovado

[Execução 39763719330](https://github.com/maiaswedig/CSBOOST/actions/runs/39763719330), commit `05526345ad1b51e9018098159ce5649380469a34`. Os três jobs concluíram com sucesso. A impressão de código dos testes remotos coincide exatamente com a fonte da candidata local: `2a7f406f1a6036e9907985f6dfdd05b0bc14364a6ceca3ee926e49451e1efa51`.

| Ambiente | Aprovados | Falhas | Skips |
|---|---:|---:|---:|
| Windows hospedado | 902 | 0 | 0 |
| Ubuntu hospedado | 892 | 0 | 10 |
| Interface Windows | 107 verificações | 0 erros do renderer | 0 |

Todos os sete testes locais limitados pelo privilégio de links simbólicos passaram no Windows hospedado. Os dez skips Ubuntu exigem workers/APIs Windows, compilador .NET ou PresentMon Windows. A lista individual e as razões extraídas das condições de skip estão no resumo estruturado de evidências; não são contabilizados como aprovação Linux das integrações nativas.

As primeiras rodadas revelaram dois problemas no preparo da CI: o caminho temporário abreviado 8.3 era recusado pelas verificações de identidade das pastas e o lançador Electron tinha nome diferente de CSBOOST.exe, recusado corretamente pelo teste de atalho. O workflow usa agora a pasta temporária canônica do runner e um lançador de QA com o nome do produto. As proteções da aplicação não foram relaxadas, testes não foram removidos e nenhuma falha foi ignorada.

A conta atingiu a cota de armazenamento de artefatos do GitHub. Os resultados, impressões e skips ficam nos logs e resumos da execução. Os hashes das capturas remotas estão no resumo; os arquivos dessas imagens não foram retidos. Capturas locais de revisão continuam no pacote de fonte. Não foram contratados recursos nem apagados anexos de outros projetos.

Os relatórios incluídos no ZIP executável são um registro anterior à última execução remota. Este complemento e EVIDENCIAS-1.30.0.json, na fonte e no pacote de auditoria, atualizam o aceite P1. O pacote foi reconstruído para registrar os pedidos de licença enviados; a identidade do executável permaneceu igual e o hash do ZIP foi recalculado.

O [resumo estruturado de evidências](EVIDENCIAS-1.30.0.json) preserva impressões, contagens e escopo sem caminhos pessoais ou backups brutos. Não foi medido ganho de FPS nem homologado anti-cheat.

## O que continua aberto

Permissão para gravar políticas no usuário atual e observação do efeito em Chrome/Edge; respostas/licenças das fontes externas; análise externa Microsoft após release; login Steam real, benchmark/efeitos no jogo e homologações da matriz. O teste unitário hospedado não substitui uma GPU NVIDIA física nem valida ganho de FPS. O canal privado de vulnerabilidades deve ser definido antes de abrir o repositório ao público; por enquanto, participantes autorizados podem usar as issues privadas.

Não foi publicado um release do app. O app continua sem assinatura por decisão já registrada. Perfis temporários de navegador usados nos ensaios foram preservados em analysis após a revisão automática bloquear a limpeza por política; não entram no repositório nem nos pacotes.

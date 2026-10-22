# CSBOOST para Windows x64

Versão atual: 1.30.0

O código original é MIT; componentes, modelos e fontes de terceiros mantêm os termos próprios. CSBOOST é independente e não é afiliado, endossado nem patrocinado por Valve, Steam, NVIDIA, AMD ou Intel. Consulte `NOTICE` e `FONTES-DE-DADOS.md` antes de redistribuir conteúdo externo.

Interface em preto, branco e grafite, com início direto, navegação compacta e controles padronizados. As cores das configurações do jogo conservam suas cores; avisos e estados de funcionamento mantêm sinalização própria.

A sessão avançada inclui prioridade de memória baixa, manual e por aplicativo, com journal de restauração e proteção contra mudanças externas. EcoQoS não é gerenciado pelo CSBOOST por decisão de produto: navegadores como Chrome e Edge controlam seu modo de eficiência por processo, e a intervenção do app poderia competir com essa política. As APIs do Windows permitem consultar e restaurar o estado; essa escolha não decorre de limitação da API.

Boost Máximo e FPS+ calculam a seleção de ajustes no motor. As opções individuais ficam recolhidas em Configurações avançadas. O automático preserva resolução, FPS máximo, gravação e afinidade, respeita bateria e mantém o plano atual em Ryzen X3D. As três opções extras de filtragem NVIDIA ficam fora da seleção automática e exigem escolha manual. Gráficos podem perder qualidade; o resultado deve ser medido.

A política de energia é compartilhada entre Boost, sessão e benchmark. O benchmark mantém o plano atual nos dois lados e registra o GUID observado. A comparação assistida pede uma referência nova se o plano Antes estiver desconhecido; históricos anteriores à 1.27 continuam identificados como antigos. As três opções extras de filtragem NVIDIA agora exigem seleção manual.

No benchmark, a coleta opcional de frametimes pelo PresentMon 2.3.1 pode ser ativada em Configurações avançadas de medição. Ela começa quando VProf confirma a fase de medição, lê ETW e não muda a fonte principal do resultado: FPS médio e P1 continuam vindo do CS2/VProf. A coleta começa depois do início VProf e pode perder os primeiros quadros. Exige acesso ETW e vem desativada. Sem permissão, a medição VProf continua. Apresenta mediana, P95/P99, 1% low calculado da série ETW e picos experimentais; razões de tempo ocupado ficam indisponíveis quando HAGS/API são desconhecidos. A diferença entre fontes não comprova ganho.

Configurações avançadas inclui consulta de topologia de CPU experimental e somente leitura. A tela mostra grupos, máscaras e relações de cache quando as APIs do Windows permitem correspondência exata; a sessão também amostra o estado `Parked` a cada 10 segundos. O resumo é por domínio de cache e não identifica por suposição o CCD preferido ou onde o CS2 executa. O app não altera afinidade, CPU Sets ou estacionamento nem libera automação. Uma identificação X3D positiva protege o plano de energia. Assimetria de L3 sozinha não identifica 3D V-Cache.

Sessões iniciadas pelo app incluem balanceamento de CPU por carga e restauração de prioridades de processos selecionados. Sob pressão sustentada, o automático pode reduzir temporariamente navegadores e clientes de sincronização conhecidos (OneDrive, Dropbox e Google Drive). O monitor nativo usa uma varredura de processos por amostra e restaura suas alterações. Outro Process Lasso ativo suspende essas regras próprias. AMD/Intel compartilham as APIs gerais; Radeon usa vídeo/Windows, sem presumir controles de driver exclusivos NVIDIA. Consulte o guia para limites do benchmark e da sessão.

Extraia **todo o ZIP** e abra `CSBOOST/CSBOOST.exe`. Steam e CS2 são instalações separadas de cada usuário. O runtime do aplicativo está incluído; Node.js/Python não são necessários.

Leia **COMO-USAR.txt** para primeiro uso, backups, atualização, benchmark e remoção. Em **Configurações → Compatibilidade deste PC**, confira os módulos detectados para o hardware e crie um atalho desta versão.

Alvo do pacote: Windows 10/11 x64. Isso não significa homologação física de cada CPU, GPU, driver ou versão do sistema. A [matriz de compatibilidade](COMPATIBILIDADE.md) separa testes automatizados, relatos do responsável e verificações físicas; apenas estes últimos validam uma combinação real. AMD/Intel e GPUs de outros fabricantes permanecem sem validação física nesta candidata. A captura ETW e a topologia são experimentais. Não há garantia de ganho de FPS. Leia também [Privacidade](PRIVACIDADE.md) e [fontes e termos externos](FONTES-DE-DADOS.md).

Em **Desempenho → CPU, RAM e GPU**, PBO/CO e XMP/EXPO ficam reunidos em uma aba de hardware. O novo guia reconhece o nome da GPU e oferece páginas oficiais da NVIDIA, AMD, Intel e MSI para ferramentas de ajuste. O CSBOOST não define clocks por semelhança de modelo nem grava overclock; scanners do fabricante testam a placa instalada. A Intel XTU depende de CPU e chipset compatíveis. Serviços do Windows não são desativados em massa; a sessão trabalha com prioridade temporária de processos conhecidos sob pressão sustentada de CPU.

O perfil NVIDIA do CS2 oferece o preset recomendado para energia, atualização, filtragem e baixa latência usando apenas opções reconhecidas pelo driver, com restauração dos valores anteriores. Resolução nativa, frequência estável, escala, cor e G-SYNC aparecem como escolhas do usuário porque dependem do monitor e não aumentam FPS por si só.

A prévia mantém uma única cena interativa, agora com fundo original e modelo com atribuição/licença documentadas. O pacote não inclui os visuais extraídos do CSCLIENT usados em versões pessoais anteriores.

Times e configs, Ranking e Notícias oferecem apenas links oficiais nesta candidata. As consultas, imagens e leitura do cache dessas fontes ficam bloqueadas no processo principal. O botão Limpar dados públicos antigos remove o cache reconhecido sem afetar perfis ou backups. Miniaturas dos perfis locais continuam sendo desenhos da mira salva sobre a cena própria.

A candidata atual não tem certificado de assinatura digital Windows. Manifestos e SHA-256 conferem integridade/completude; não substituem autenticação do editor. Atualizações são manuais, extraídas em pasta nova. Perfis e backups permanecem locais no usuário do Windows. A captura ETW é opcional e desativada por padrão; não foi testada em FACEIT ou Gamers Club. O CSBOOST não injeta código no jogo.

## Estado atual: ZIP sem assinatura

O responsável pelo projeto escolheu manter a distribuição em ZIP sem assinatura digital. Portanto, `CSBOOST.exe` e os oito executáveis auxiliares do CSBOOST devem aparecer como `NotSigned`; isso não indica, por si só, corrupção do pacote. Também significa que o Windows não consegue confirmar a identidade do publicador e pode exibir avisos do SmartScreen. Só abra um ZIP obtido no GitHub Releases oficial do projeto e compare seu SHA-256 com o valor publicado no texto da página do release. Um manifesto que vem dentro do próprio ZIP não autentica sua origem.

## Conferir o ZIP antes de abrir

Na página do GitHub Releases, copie o SHA-256 publicado fora do ZIP. No PowerShell, dentro da pasta do download, rode:

```powershell
Get-FileHash -LiteralPath .\CSBOOST-1.30.0-Windows-x64.zip -Algorithm SHA256
```

Compare o campo `Hash` com o valor da página do release. Se forem diferentes, não abra o pacote. O arquivo `.sha256.txt` acompanha a distribuição para detectar corrupção, mas a comparação com um valor publicado separadamente é o que reduz o risco de um ZIP e seu manifesto terem sido alterados juntos.

## Se o Microsoft Defender bloquear um arquivo

Não desative o Defender, não crie uma exclusão e não instale certificado para contornar o aviso. Primeiro confirme que o ZIP veio do canal oficial e que o hash coincide. Anote o nome da detecção e a versão das definições; depois envie somente o arquivo marcado como incorretamente detectado pelo [portal Microsoft Security Intelligence](https://www.microsoft.com/wdsi/filesubmission), escolhendo a opção de detecção incorreta. O portal aceita arquivos até 50 MB; para um arquivo maior, use a opção oficial de envio de URL. Guarde o número do protocolo e aguarde a análise antes de redistribuir o arquivo.

## Conferir uma futura versão assinada

Se uma versão assinada for publicada, extraia o pacote inteiro e confira `CSBOOST.exe` em **Propriedades → Assinaturas Digitais**. Selecione a assinatura e abra **Detalhes**: o Windows deve informar que a assinatura digital é válida e o nome do publicador deve corresponder à identidade anunciada pelo projeto. Confira também os oito executáveis próprios na pasta `resources\app\native`; o console PresentMon é de terceiros e mantém a assinatura Intel.

Também é possível verificar os nove executáveis CSBOOST pelo PowerShell, a partir da pasta extraída:

```powershell
$files = @('.\CSBOOST.exe') + (Get-ChildItem '.\resources\app\native' -Filter 'csboost-*.exe' | ForEach-Object { $_.FullName })
$files | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_
  [pscustomobject]@{ File = Split-Path $_ -Leaf; Status = $signature.Status; Publisher = $signature.SignerCertificate.Subject; Timestamp = $signature.TimeStamperCertificate.Subject }
}
```

Para essa futura versão, o estado esperado é `Valid` em todos os arquivos e o mesmo publicador CSBOOST. Se ela for anunciada como assinada e aparecer sem assinatura, inválida ou com outro publicador, não a execute e confirme o pacote com o responsável. `SHA-256` ajuda a detectar arquivos incompletos ou alterados somente quando comparado a um hash obtido por um canal confiável; o hash dentro do mesmo ZIP não prova quem o publicou. Uma assinatura válida identifica o publicador e detecta alterações, mas uma nova assinatura ainda pode receber aviso do SmartScreen enquanto constrói reputação.

Não contém sessão, Steam ID, arquivos de jogo ou perfis do computador que gerou o pacote. Avisos/licenças acompanham a distribuição completa. O relatório de compatibilidade é exportado apenas por ação do usuário, sem dados da conta ou caminhos.

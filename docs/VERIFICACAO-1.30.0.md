# Verificação da candidata CSBOOST 1.30.0

Data inicial: 21/10/2026; complementada em 22/10/2026 (America/Sao_Paulo). Ambiente: Windows 10 Home x64, build 19045, Node.js v24.20.0. Inventário somente leitura: Ryzen 5 5600, GeForce RTX 4060, driver 32.0.16.1062; Chrome 155.0.8059.85 e Edge 155.0.4283.62.

## Resultados desta execução

| Verificação | Resultado |
|---|---|
| Suíte Node.js | 902 testes: 895 aprovados, 0 falhas, 0 cancelados e 7 ignorados; motivos individuais abaixo |
| Interface Electron | 107 verificações aprovadas, zero erros do renderer; nove páginas em 1400×864, 1100×740 e 960×640, além do aviso de entrada visível nos tamanhos normal e mínimo |
| Prévia 3D | 10 verificações aprovadas com GLTF/texturas locais e WebGL2/SwiftShader; zero erros; não é teste físico da GPU |
| Imagens públicas reais | 9 verificações aprovadas com páginas e mídia públicas reais, atribuição, aliases e fallback; sem aplicar configurações |
| Documentação | Versão 1.30.0, changelog e links locais aprovados |
| Inicialização do executável e extração do ZIP | Build `CSBOOST-Free-130-Final` iniciou corretamente em Windows real; 130 arquivos do app conferidos, zero erros, zero rede observada, monitor e recuperação disponíveis. A extração do ZIP exato é registrada nos metadados externos `CSBOOST-1.30.0-Windows-x64-release.json` e no relatório de auditoria |
| Fontes ao vivo | Catálogo: 100 jogadores; donk, m0NESY e FalleN com prévias de configurações. Steam: 20 notícias. Valve: 380 equipes, publicação de 05/10/2026. Nenhuma config foi aplicada ao jogo |
| CI Ubuntu e Windows hospedados | Não executado; esta cópia não está vinculada a repositório/CI remoto |

Steam/login, jogo, Registro, drivers, energia e sessões da suíte visual utilizam adaptadores simulados e arquivos temporários. A inicialização do pacote real é somente leitura e usa uma pasta isolada; não inicia CS2 nem aplica preferências. Separadamente, a verificação NVIDIA de 22/10/2026 aplicou e restaurou um controle real; o teste de políticas de navegador foi negado e conferiu a preservação dos valores. Fotos/logos do cenário específico são consultas reais às fontes públicas. Esses resultados não medem ganho de desempenho ou homologação física dos ajustes.

## Comandos e evidências

```powershell
npm test
$env:CSBOOST_REQUIRE_UI='1'; npm run test:ui
$env:CSBOOST_UI_3D_ONLY='1'; npm run test:ui
Remove-Item Env:CSBOOST_UI_3D_ONLY
$env:CSBOOST_UI_PRO_MEDIA_ONLY='1'; npm run test:ui
Remove-Item Env:CSBOOST_UI_PRO_MEDIA_ONLY
npm run check:docs
node tools/verify-pro-public.mjs
npm run build -- CSBOOST-Free-130-Final
npm run verify -- CSBOOST-Free-130-Final
npm run package:friends -- CSBOOST-Free-130-Final
node tools/verify-friends-package.cjs
npm run audit:distribution -- CSBOOST-Free-130-Final --require-package
```

O último comando de auditoria exige evidência da extração do ZIP exato. `npm test` grava contagens, skips, hash do log e uma impressão do código/testes/ferramentas; a UI registra a mesma impressão. O empacotamento recusa evidências antigas, falhas ou de outra versão do código. Alterar entradas exige nova execução. Os relatórios completos ficam localmente em `analysis/free-verification/` e `analysis/free-ui-qa/`, fora da distribuição. Esta ficha acompanha o código e o pacote.

## Cada teste não executado

Os sete casos abaixo dependem da criação de um link simbólico de arquivo no Windows. O host recusou a criação por falta do privilégio necessário; nenhum deles foi contabilizado como aprovado. Precisam executar em um ambiente com esse recurso habilitado.

| Caso | Motivo retornado pelo teste |
|---|---|
| symbolic-link signing targets are rejected without touching the linked file | O host não permite criar symlink de arquivo. |
| CSV symlink targets are not read or removed as capture data | O host não permite criar symlink de arquivo. |
| profile files reject symbolic links for read, update and delete | The host does not permit this symbolic-link fixture. |
| apply and configured launch reject a symlink target without overwriting its destination | The host does not permit this symbolic-link fixture. |
| arquivo de recuperação com link simbólico é recusado | Windows sem privilégio de link simbólico. |
| link para fora da pasta de cache é recusado e nenhum arquivo externo é movido | Windows sem privilégio de symlink para fixture. |
| redirected users file cannot select local identity | Creating file symlinks requires Windows privileges. |

## Correções verificadas nesta revisão

- O diário compartilhado repete bloqueios transitórios de substituição (`EPERM`, `EACCES`, `EBUSY`) em até seis tentativas durante aproximadamente 620 ms; não apaga o destino para conseguir gravar e interrompe se a identidade do arquivo mudar. Testes cobrem sucesso, bloqueio persistente e mudança externa durante a espera.
- O encerramento confirmado da recuperação de shaders preserva os caches, salva recibo com os caminhos e registra auditoria. Token é de uso único, limitado ao módulo e à recuperação; jogo aberto e sessão ativa bloqueiam a ação.
- A licença original do Electron fica em `LICENSE-Electron.txt`; a MIT do CSBOOST não a sobrescreve. O botão de créditos inclui PresentMon, Inter, NVAPI, codec, three.js e modelos.
- A interface oferece opt-out de fotos/logos públicos e nomes de perfis legíveis em janela pequena.
- O verificador recusa saída antiga ou ausente mesmo se o processo encerrar sem erro. A auditoria exige correspondência entre fonte, manifesto do build e resultados atuais.
- Testes do cache aguardam a conclusão da movimentação/restauração, em vez de tratar a criação inicial do diário ou o primeiro arquivo recuperado como operação concluída.

## Não validado

Windows 11 físico; demais controles NVAPI e efeitos no jogo; aplicação e efeitos das políticas Chrome/Edge; teste funcional em Radeon, Intel, X3D, Intel híbrida e notebook; login Steam real; benchmark de FPS/latência/temperatura; ETW em FACEIT/Gamers Club; execução em Ubuntu ou no CI hospedado; condições de reutilização das fontes externas. A revisão do código e os testes não garantem ausência de defeitos ou vulnerabilidades. Não foi feita uma auditoria independente de todo o código de terceiros.

A candidata continua sem assinatura digital. SHA-256 confirma integridade quando comparado a uma referência confiável; ainda não foi publicado fora dos arquivos locais nem houve análise de falso positivo do Defender desta candidata. Consulte [Compatibilidade](COMPATIBILIDADE.md), [Privacidade](PRIVACIDADE.md), [Créditos](CREDITOS.md) e [Fontes de dados](FONTES-DE-DADOS.md).

## Complemento em 22/10/2026

O catálogo C# foi corrigido para concordar com os controles granulares e Ultra do módulo JavaScript. O teste `nvidia-native-catalog.test.mjs` executa o método de validação do auxiliar compilado sem abrir NVAPI; ele será ignorado explicitamente no Linux por exigir Windows/.NET, não por uma aprovação presumida. Nesta máquina Windows passou.

Uma alteração real de baixa latência Ultra foi aplicada com CS2 fechado e restaurada, com comparação exata do snapshot completo. O verificador reprodutível é `tools/verify-nvidia-installed.mjs`, exige `--apply-restore` e usa o diário de recuperação do aplicativo. Não é benchmark nem validação de todos os presets.

O envio ao auxiliar de Registro foi corrigido para omitir metadados de presença. Depois dessa correção, o teste de políticas recebeu confirmação nativa de acesso negado à chave HKCU Policies antes de confirmar mudança; original e ausência de backup pendente conferidos. Nenhuma ACL ou política de segurança foi alterada. A varredura local Defender e o preparo do Git/CI estão registrados em `ETAPAS-LOCAIS-2026-10-22.md` (na fonte e no pacote de auditoria).

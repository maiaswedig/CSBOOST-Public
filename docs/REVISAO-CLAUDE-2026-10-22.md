# Revisão após auditoria do Claude — 22/10/2026

Candidata 1.30.0, sem publicação pública. Windows 11 fora do escopo desta etapa.

## Implementado

- Serviços de publicação bloqueiam ProSettings, fotos/logos, rankings e notícias no processo principal, antes de cache/rede. Os serviços originais não são instanciados em produção; links oficiais usam uma lista fixa.
- Telas mostram links e limpeza manual de cache antigo, limitada a arquivos reconhecidos e sem seguir links simbólicos.
- Electron nega pedidos e verificações de permissão. A CSP existente restringe conexões e conteúdo remoto.
- MIT canônica, titular identificado, metadados no package.json, AUTHORS, CONTRIBUTING e registro de procedência.
- Privacidade descreve autenticação Steam local e cache antigo; README não divulga hashes e execuções antigas como identidade da nova candidata.

## Pontos de auditoria confirmados ou delimitados

Os créditos 3D já existem e informam autores, links e alterações. A CSP também já existia. O pacote final deve confirmar novamente a presença de todos os avisos. Relatórios antigos de Defender e CI não certificam o ZIP reconstruído.

As integrações bloqueadas continuam no código para revisão; novos termos, retenção e limitação de consultas devem ser revistos antes de qualquer reativação. As permissões externas não foram concedidas. Não se deduz autorização do acesso público.

## Pendências de publicação

A revisão do histórico não comprova titularidade ou ausência de semelhança com outros produtos. Não abrir o histórico exploratório sem revisão do responsável. Nenhum repositório será tornado público automaticamente. Testes físicos de navegador, ganho de FPS e homologação anti-cheat não estão certificados.

Resultados e identidade da nova candidata serão gravados em registros de verificação separados após os testes. Evidências anteriores em EVIDENCIAS-1.30.0.json são históricas.

## Verificações executadas

905 testes de código: 898 aprovados, zero falhas e sete skips por privilégio local de links simbólicos. Interface geral: 107 verificações, zero erros do renderer. Ensaio adicional da candidata pública: as três telas oferecem apenas links oficiais e limpeza de cache, sem conteúdo externo, em largura mínima; a preferência de mídia está bloqueada. Capturas inspecionadas localmente.

O cache antigo não é utilizado pela candidata. Limitação de taxa, atualização de User-Agent e retenção no código legado permanecem fora do caminho ativo e devem ser implementadas antes de reativá-lo. Não são declaradas como concluídas nesta revisão.

A primeira execução remota detectou dependência de rede no ensaio legado de rankings. O ensaio geral passou a usar respostas sintéticas por injeção de fetch; o ensaio das telas bloqueadas foi adicionado à CI. A falha remota inicial fica registrada no histórico; não foi ignorada.

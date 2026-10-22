# Matriz de compatibilidade — CSBOOST 1.30.0

Esta matriz separa o alvo do pacote, os testes automatizados e a validação em computador real. Testes com dados simulados não comprovam compatibilidade física ou ganho de desempenho.

| Ambiente ou recurso | Evidência disponível nesta candidata | Situação |
|---|---|---|
| Windows 10/11 x64 | O pacote e os auxiliares são preparados para Windows x64. O inventário somente leitura desta máquina confirmou Windows 10 Home build 19045. | Windows 10: inicialização e integridade do pacote verificadas, sem alterar ajustes. Windows 11 e integração física dos ajustes ainda pendentes |
| Linux | CI pretende executar os testes JavaScript em Ubuntu. A suíte cobre lógica portátil e fixtures. | Validar no CI após envio do código |
| GPU NVIDIA | O inventário somente leitura observou uma GeForce RTX 4060 com driver 32.0.16.1062. Em 22/10/2026, o auxiliar corrigido aplicou um override unitário de baixa latência Ultra com CS2 fechado e restaurou o snapshot completo do perfil. Testes automatizados também exercitam seleção, conflitos e restauração com dados simulados. Não houve teste no jogo nem benchmark. | Aplicação/restauração unitária verificada neste Windows 10; demais controles, Windows 11 e desempenho pendentes |
| GPU AMD / Adrenalin | Inventário, assinatura e caminho do executável são cobertos por testes simulados. Nenhum PC AMD foi consultado neste ambiente. | Testado em fixtures; hardware real pendente |
| GPU Intel | Recursos gerais e identificação são condicionais; perfil proprietário não é prometido. Não houve teste físico. | Pendente |
| Chrome e Edge | Foram encontrados Chrome 155.0.8059.85 e Edge 155.0.4283.62. As políticas opcionais são limitadas ao usuário atual, verificam presença/versão e bloqueiam quando detectam política de máquina. Restauração e conflitos têm testes automatizados. Em 22/10/2026, a tentativa real de gravar as três políticas foi negada pelo Windows; os valores originais foram conferidos e não ficou backup pendente. Páginas de políticas foram abertas em perfis isolados. | Permissão de gravação insuficiente neste usuário; aplicação/efeito em navegador real pendentes |
| CPU AMD, Intel híbrida, Ryzen X3D e notebooks | Alguns caminhos são simulados. Não há validação física desta candidata para afinidade, energia, carga térmica, estacionamento ou topologia. | Pendente por combinação |
| ETW / anti-cheats | Captura é opcional e desativada por padrão; FACEIT e Gamers Club não foram homologados. | Experimental; não homologado |
| FPS e latência | Comparações dependem do jogo, driver, energia, temperatura e benchmark. Nenhum resultado desta candidata prova ganho universal. | Sem promessa de ganho |

## Conflitos de controles NVIDIA

| Controles | Relação documentada | Orientação no CSBOOST |
|---|---|---|
| Low Latency On e Ultra | São dois níveis do mesmo controle do driver. | Seleção exclusiva no fluxo Boost; Ultra é experimental e nunca automático. |
| Reflex do CS2 e Ultra Low Latency do driver | A NVIDIA informa que Reflex ativo substitui a função Ultra do driver. | O detalhe de Ultra mostra o aviso; prefira testar Reflex dentro do jogo e não conte com benefício adicional do override. |
| VSync e buffer triplo | A documentação do Painel NVIDIA descreve buffer triplo para OpenGL junto com VSync; o comportamento depende da API e do modo de tela. | Não tratar como ganho geral no CS2. O usuário compara tearing e cadência; o CSBOOST não liga buffer triplo automaticamente. |
| VSync do jogo e VSync forçado pelo driver | Um override pode prevalecer sobre a preferência do jogo e alterar tearing/latência. | Ajuste manual fora do automático e compare uma mudança por vez. |

As opções do driver são limitadas ao perfil do CS2 e só entram no plano quando a NVAPI as reconhece. O CSBOOST não inclui novos módulos automáticos com base apenas em nomes ou benchmarks de terceiros.

## Relato anterior do responsável

O material de evolução menciona uso anterior em Windows 10 com Ryzen 5 5600 e RTX 2060 SUPER. O inventário atual desta máquina mostra RTX 4060. O relato da placa anterior pertence a outra instalação/versão e não é evidência de homologação da candidata 1.30.0.

## O que ainda precisa ser registrado

Antes de afirmar compatibilidade física, registrar em um computador de teste descartável: edição e build do Windows, CPU, GPU, versão do driver, versões de Chrome/Edge instaladas, passos realizados e resultado observado. Remover nome de usuário, caminho pessoal, Steam ID e demais identificadores do relatório. A ficha atual está em [verificação da candidata](VERIFICACAO-1.30.0.md).

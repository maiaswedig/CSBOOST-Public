# Validação em VM descartável

Use Windows x64 com snapshot, Steam e uma conta de teste. Não use dados ou configurações pessoais. Registre valores iniciais, versão/driver e hashes. A VM comum não oferece necessariamente uma GPU NVIDIA real; teste NVIDIA somente com passthrough adequado, em ambiente descartável.

1. Tire snapshot e feche CS2. Confira energia, Registro de Modo de Jogo e arquivo de vídeo da conta de teste.
2. Aplique cada grupo isoladamente e restaure. Compare bytes/valores originais e registros de recuperação.
3. Repita com alteração externa: a restauração deve preservar o conflito e manter backup, sem declarar sucesso.
4. Encerre o processo principal durante uma sessão de teste. Aguarde o recovery guard e confira prioridades/afinidade/energia e relatório persistente.
5. Feche por Alt+F4 com sessão, benchmark, FPS pendente e Boost em aplicação/restauração pendente. A janela deve permanecer disponível para resolver a pendência; uma segunda instância deve focá-la.
6. Com Boost persistente concluído, confirme que fechar/reabrir mantém a configuração e o estudo. Abertura automática é opt-in: confira a entrada própria, reinicie a VM, confirme uso único e que nenhum jogo iniciou sem clicar. Alterações externas da entrada devem ser preservadas.
7. Restaure snapshot entre cenários. Não execute PBO/XMP nem alterações físicas em VM.

Este é um roteiro, não declaração de execução. Os testes automatizados usam fixtures. Uma VM sem GPU física não valida desempenho/driver real nem ganho de FPS.

# Privacidade do CSBOOST

Aviso da candidata 1.30.0 — revisão de 22/10/2026.

## Dados que ficam neste computador

A opção “Usar conta da Steam neste PC” lê o identificador ActiveUser no Registro HKCU da Steam e verifica config/loginusers.vdf para confirmar uma conta local. A senha não é lida; AccountName não é guardado pelo CSBOOST. A identidade local é conferida durante o uso. O login pelo navegador usa OpenID no site da Steam. O CSBOOST não pede nem armazena a senha Steam. Para associar perfis e configurações ao usuário local, guarda o identificador público Steam e a data da sessão em arquivos da pasta de dados do CSBOOST no Windows. O aplicativo também mantém localmente perfis, backups de restauração, histórico, medições escolhidas pelo usuário e cache limitado de conteúdo público.

Os arquivos do jogo e os relatórios exportados são lidos ou gravados somente nas ações descritas na interface. As exportações de histórico e compatibilidade filtram identificadores da conta e caminhos pessoais do Windows; o histórico também filtra e-mails. Perfis portáteis e arquivos CFG preservam os nomes e valores escolhidos por você, portanto confira seu conteúdo antes de compartilhar. A exportação de compatibilidade e os relatórios de diagnóstico são iniciados pelo usuário. O CSBOOST não inclui telemetria de uso ou envio automático desses arquivos nesta candidata.

## Consultas externas

Nesta edição, ProSettings, fotos/logos, ranking e notícias não são consultados nem recuperados do cache. As áreas correspondentes oferecem apenas links oficiais abertos no navegador mediante clique. O navegador envia os dados de rede normais ao site escolhido. Login Steam OpenID e abertura do perfil público continuam mediante ação do usuário. Não enviamos perfis, backups ou relatórios nessas ações.

Caches de edições anteriores podem permanecer em %APPDATA%/csboost-free, nas subpastas content, pro-library e pro-media. Não são usados nesta edição. O botão “Limpar dados públicos antigos” remove somente arquivos de cache reconhecidos dessas três pastas. Não remove perfis nem backups de restauração. O serviço não permite reativar as consultas por preferência da interface.

## Controle e exclusão

Você pode sair da conta pela interface e remover manualmente a pasta de dados do CSBOOST depois de fechar o aplicativo. Isso apaga perfis, cache, histórico e cópias de restauração guardadas nessa pasta. Os arquivos do CS2 que você aplicou, como `csboost.cfg`, ficam na pasta do jogo e devem ser removidos ou restaurados separadamente pela interface.

Se você publicar um relatório de erro, confira o conteúdo antes de compartilhar. Não inclua arquivos de perfil, backups, identificadores de conta, e-mails ou caminhos pessoais.

Este aviso descreve o comportamento implementado na candidata 1.30.0 e precisa ser revisto antes de cada distribuição pública.

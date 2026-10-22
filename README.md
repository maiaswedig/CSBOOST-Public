# CSBOOST

Versão atual: 1.30.0

Aplicativo independente para Windows x64 com perfis locais de CS2, editor de mira e prévia, ajustes reversíveis e comparação de medições. Não promete ganho de FPS.

## Download

[Baixar CSBOOST 1.30.0](https://github.com/maiaswedig/CSBOOST-Public/releases/tag/v1.30.0). Extraia todo o ZIP antes de abrir CSBOOST.exe. Steam e CS2 são instalações separadas.

Arquivo: CSBOOST-1.30.0-Windows-x64.zip

SHA-256: 5df68c9dc67048a4f7c234ca9e3169b998446fe79a5f94c57428216222f28125

O aplicativo não tem assinatura digital; o Windows pode exibir aviso de publicador desconhecido. Confira o hash publicado na página oficial do release.

## Escopo desta edição

ProSettings, fotos/logos, ranking e notícias estão desativados no processo principal; as telas oferecem somente links oficiais. A configuração visual é demonstrativa. Ganhos de desempenho, comportamento durante gameplay e compatibilidade com anti-cheat não são certificados. A documentação de [compatibilidade](docs/COMPATIBILIDADE.md) informa limites e escopo dos testes.

Código original sob [MIT](LICENSE). Componentes e materiais de terceiros têm termos próprios em [NOTICE](NOTICE), [dependências](docs/DEPENDENCIAS.md) e [procedência](docs/PROCEDENCIA.md). O projeto não é afiliado nem endossado por Valve, Steam ou fabricantes. Consulte [privacidade](docs/PRIVACIDADE.md) e [segurança](SECURITY.md).

## Fonte e testes

Este repositório inicia com um snapshot da fonte revisada. O histórico exploratório permanece privado. Relatórios anteriores preservados em docs são registros históricos; a identidade do download e os resultados atuais estão nos anexos do release e nas execuções deste repositório.

Use Node.js 24, npm test e npm run check:docs. As instruções de preparo Windows e Electron estão em .github/workflows/test.yml. O ZIP inclui o runtime; usuários não precisam instalar Node.js.

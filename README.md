# CSBOOST

Versão atual: 1.30.0

Aplicativo independente para Windows x64 com perfis locais de CS2, editor de mira e prévia, ajustes reversíveis e comparação de medições. Não promete ganho de FPS.

## Download

[Instalador (.exe)](https://github.com/maiaswedig/CSBOOST-Public/releases/download/v1.30.0/CSBOOST-1.30.0-Windows-x64-Setup.exe) para instalação guiada; siga as etapas e abra CSBOOST.  
[ZIP portátil](https://github.com/maiaswedig/CSBOOST-Public/releases/download/v1.30.0/CSBOOST-1.30.0-Windows-x64.zip) para extrair e abrir CSBOOST.exe sem instalar. Steam e CS2 são instalações separadas.

SHA-256 do instalador: `5a0f9bb78dbdbab2046a4a00929169b7080f25d35b3d2b74cd026c2a1771b155`  
SHA-256 do ZIP: `5df68c9dc67048a4f7c234ca9e3169b998446fe79a5f94c57428216222f28125`

O aplicativo e o instalador não têm assinatura digital; o Windows pode exibir aviso de publicador desconhecido ou SmartScreen. Confira o hash correspondente ao pacote baixado.

## Escopo desta edição

ProSettings, fotos/logos, ranking e notícias estão desativados no processo principal; as telas oferecem somente links oficiais. A configuração visual é demonstrativa. Ganhos de desempenho, comportamento durante gameplay e compatibilidade com anti-cheat não são certificados. A documentação de [compatibilidade](docs/COMPATIBILIDADE.md) informa limites e escopo dos testes.

Código original sob [MIT](LICENSE). Componentes e materiais de terceiros têm termos próprios em [NOTICE](NOTICE), [dependências](docs/DEPENDENCIAS.md) e [procedência](docs/PROCEDENCIA.md). O projeto não é afiliado nem endossado por Valve, Steam ou fabricantes. Consulte [privacidade](docs/PRIVACIDADE.md) e [segurança](SECURITY.md).

## Fonte e testes

Este repositório inicia com um snapshot da fonte revisada. O histórico exploratório permanece privado. Relatórios anteriores preservados em docs são registros históricos; a identidade do download e os resultados atuais estão nos anexos do release e nas execuções deste repositório.

Use Node.js 24, npm test e npm run check:docs. As instruções de preparo Windows e Electron estão em .github/workflows/test.yml. O ZIP inclui o runtime; usuários não precisam instalar Node.js.

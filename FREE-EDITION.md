# CSBOOST — edição independente

Versão atual: 1.30.0

O CSBOOST é um aplicativo independente para ajustar perfis do Counter-Strike 2 e medir o comportamento do jogo. Ele não depende de assinatura, serviços ou APIs do CSCLIENT.

## Recursos atuais

- Editor de mira, FOV, posição da arma, HUD e radar com uma prévia compartilhada; criação, importação e aplicação de perfis locais.
- Links oficiais para configurações, ranking e notícias; consultas e imagens externas desativadas nesta candidata.
- Análise de compatibilidade do computador e boosters recomendados para Windows, CPU e GPU. As opções individuais ficam em Configurações avançadas; as alterações próprias podem ser restauradas.
- Sessão de jogo com ajustes temporários de prioridade e recuperação, além do FPS+ com uma medição Antes e uma Depois.
- Guias assistidos para PBO/Curve Optimizer e XMP/EXPO, e links oficiais para ferramentas do fabricante de GPU. A aplicação de firmware e overclock continua sob controle do usuário na ferramenta ou BIOS correspondente.

## Compatibilidade e limites

O pacote candidato tem como alvo o Windows 10/11 x64, mas isso não significa validação física em todas as versões e combinações. Veja a [matriz de compatibilidade](docs/COMPATIBILIDADE.md): resultados simulados e de CI não substituem teste em hardware real. As funções gerais usam APIs do Windows e arquivos do jogo; recursos específicos de GPU dependem do fabricante e do driver. A topologia da CPU e a captura ETW são experimentais e somente leitura. O CSBOOST não desativa serviços do Windows em massa, não grava ajustes universais de firmware e não garante aumento de FPS em todo computador.

Para instalação, uso, atualização, remoção e limites detalhados, consulte o [guia de uso](docs/COMO-USAR.txt) e a [documentação de distribuição](docs/DISTRIBUICAO.md). O histórico está em [docs/CHANGELOG.md](docs/CHANGELOG.md).

O código próprio é distribuído sob MIT. Os avisos de não afiliação e os termos de componentes e fontes externos estão em [NOTICE](NOTICE) e [docs/FONTES-DE-DADOS.md](docs/FONTES-DE-DADOS.md). Esta candidata não possui assinatura digital; verifique o SHA-256 anunciado no GitHub Releases antes de abrir o pacote.

## Desenvolvimento

```powershell
npm run build -- CSBOOST-Free-NOME
npm run verify -- CSBOOST-Free-NOME
npm test
npm run test:ui
npm run check:docs
```

O build requer Windows x64, Node.js e os recursos fixados em `vendor/`. Ele cria uma pasta nova em `output/` e não sobrescreve builds existentes.

# Componentes da distribuição CSBOOST 1.30.0

O código próprio do CSBOOST é distribuído sob a licença MIT, reproduzida em LICENSE-CSBOOST.txt e LICENSE. Os componentes de terceiros mantêm suas próprias licenças; avisos e atribuições acompanham o pacote inteiro.

| Componente | Origem fixada | Aviso |
| --- | --- | --- |
| Intel PresentMon console 2.3.1 | Release oficial fixada, SHA-256 `364e5d98d4d134bd54dd25c22ed2ca2f4883f8bc3ed6502bee0c151e3436d30c`, assinatura Intel verificada na aquisição | resources/app/licenses/PresentMon-MIT.txt e PresentMon-PROVENANCE.json |
| Electron e Chromium/Node incorporados | ZIP oficial 44.4.3 Windows x64, SHA-256 fixado no build | LICENSE-Electron.txt, LICENSES.chromium.html |
| Inter | InterVariable.woff2 validado por hash | resources/app/renderer/fonts/OFL.txt |
| Definições públicas NVAPI | NVIDIA, commit 70d337db9186e968eab622f7e786de7e437faf3d | resources/app/licenses/NVAPI-MIT.txt |
| Codec adaptado csgo-sharecode | akiver 7.0.1, commit 139b9e284756110b44a894331f285b0ddabdf6ef | resources/app/licenses/csgo-sharecode-MIT.txt |
| three.js / GLTFLoader | 0.180.0, npm oficial com SHA-512 fixado, arquivos locais | resources/app/licenses/three-MIT.txt |
| Modelo estático de arma/braços | cktang88/3d-fps, commit 130ac2a5c856401ec36e7d35afcfefe40c5801f4; CC BY4.0 / componentes CC0, autores e fontes nos créditos | resources/app/licenses/preview3d-CREDITS.txt e CC-BY-4.0.txt |
| Fundo original | Gerado para CSBOOST, proveniência/hash no manifesto visual | resources/app/renderer/assets/preview-distribution-provenance.json |

O modelo tem geometria descomprimida e texturas embutidas, sem animações, decoder, WASM ou fetch de texturas em produção. O loader adapta somente o carregamento de imagens locais/blob, mantendo connect-src none. Renderização sob demanda, sem loop ocioso, com captura transparente da mesma arma quando WebGL estiver indisponível. Créditos/licença da captura seguem o modelo de origem.

Não inclui visuais extraídos do CSCLIENT/CS2, dados pessoais, perfis, tokens, sessões, arquivos de jogo, testes ou ferramentas de build. O pacote inclui oito auxiliares CSBOOST compilados de fonte própria e o console PresentMon oficial. A coleta ETW é experimental, vem desativada e não instala serviço, driver de kernel ou overlay. Requer execução como administrador ou participação em Usuários de Log de Desempenho; sem acesso, VProf continua disponível. A topologia é lida sob demanda e o estado Parked é amostrado a cada 10 segundos durante sessões do jogo; ambos são somente leitura. Não inclui DLL do driver NVIDIA, Ryzen Master, Intel XTU, Steam ou CS2. .NET Framework 4.x e os componentes do Windows são pré-requisitos do sistema, não payloads redistribuídos.

Referências: [Electron](https://github.com/electron/electron), [PresentMon 2.3.1](https://github.com/GameTechDev/PresentMon/releases/tag/v2.3.1), [origem/licenças do modelo fixado](https://github.com/cktang88/3d-fps/blob/130ac2a5c856401ec36e7d35afcfefe40c5801f4/README.md#credits--licences), [NVAPI](https://github.com/NVIDIA/nvapi/blob/70d337db9186e968eab622f7e786de7e437faf3d/nvapi.h).

O alvo do pacote portátil é Windows 10/11 x64 em CPUs AMD/Intel; disponibilidade de módulos é determinada em runtime e não implica homologação física. Assinatura digital e atualização hospedada não estão configuradas. Integridade por SHA-256 não autentica o editor. Certificação física de todas as combinações não foi realizada.

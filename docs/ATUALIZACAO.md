# Atualização do runtime

O runtime atual é Electron 44.4.3, fixado com SHA-256 em tools/build-free.cjs. Não há atualizador automático implementado.

Antes de atualizar, consulte releases e avisos oficiais em https://www.electronjs.org/releases/stable e https://www.electronjs.org/docs/latest/tutorial/security . Selecione uma versão suportada, obtenha o ZIP oficial Windows x64 e confira o SHA no SHASUMS oficial da mesma versão. Não remova a validação de hash para aceitar outro arquivo.

Atualize caminho/hash/versão do runtime no build. Use uma pasta nova de saída, execute npm test, integração UI e verificação do pacote. Confira sandbox, contextIsolation, preload, IPC, origem da janela, recuperação e Alt+F4. Preserve a versão anterior para rollback. Registre versão do runtime e hashes no manifesto.

Assinatura digital: depois que o responsável escolher e instalar um certificado público de assinatura de código, configure `CSBOOST_SIGNTOOL` com o caminho absoluto do SignTool do Windows SDK, `CSBOOST_SIGN_CERT_SHA1` com o thumbprint do certificado no repositório pessoal `My` do usuário e `CSBOOST_SIGN_TIMESTAMP_URL` com um serviço RFC 3161 HTTPS. Os três valores são necessários para assinar. A chave privada permanece no armazenamento protegido do certificado; o build não aceita PFX nem senha. Ele assina o `CSBOOST.exe` e exatamente os oito workers CSBOOST, usa SHA-256, carimbo RFC 3161, verifica cada executável com `signtool verify /pa` e só então calcula os hashes do manifesto. O PresentMon preserva a assinatura Intel original. Qualquer falha interrompe o build. Sem configuração completa, a build é explicitamente marcada como não assinada.

O manifesto guarda o SHA-256 anterior e posterior à assinatura de cada executável CSBOOST, o thumbprint público do certificado, o algoritmo, o serviço de timestamp e o método de verificação. O responsável escolheu manter a distribuição atual em ZIP sem assinatura. O pacote não autentica o publicador e pode receber aviso do SmartScreen. O fluxo SignTool acima fica preparado para uma futura mudança de decisão; a assinatura não garante que o SmartScreen deixe de avisar em uma primeira instalação.

O plano de atualização continua manual. Um futuro atualizador só poderá verificar um manifesto de release assinado com chave do editor, mostrar versão e mudanças, aguardar confirmação explícita, baixar a nova versão em pasta separada e conservar a anterior para reversão. Não há atualização silenciosa nem serviço de atualização implementado. Consulte [SignTool Microsoft](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool).

Atualização automática ainda não implementada. Nunca registre senha/chave de certificado em logs ou repositório.

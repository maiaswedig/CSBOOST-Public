(() => {
  const button = document.querySelector("#pcboost-download");
  const status = document.querySelector("#pcboost-download-status");
  if (!button || !status) return;

  button.addEventListener("click", async () => {
    const parts = button.dataset.parts.split(",");
    const original = button.textContent.trim();
    button.disabled = true;
    button.textContent = "Baixando PCBOOST…";
    status.textContent = "Baixando e reunindo o arquivo portátil.";
    try {
      const responses = await Promise.all(parts.map((path) => fetch(path, { cache: "no-store" })));
      if (responses.some((response) => !response.ok)) throw new Error("Parte indisponível");
      const chunks = await Promise.all(responses.map((response) => response.blob()));
      status.textContent = "Conferindo a integridade do arquivo…";
      const file = new Blob(chunks, { type: "application/zip" });
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
      if (actual !== button.dataset.sha256) throw new Error("O hash não corresponde");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "PCBOOST-0.1.33.0-Windows-x64.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "Download iniciado. SHA-256 conferido.";
    } catch {
      status.textContent = "Não foi possível preparar o download. Atualize a página e tente novamente.";
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
})();

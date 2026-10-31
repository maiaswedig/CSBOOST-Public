(() => {
  const button = document.querySelector("#pcboost-download");
  const status = document.querySelector("#pcboost-download-status");
  if (!button || !status) return;
  let active = null;

  button.addEventListener("click", async () => {
    if (active) { active.abort(); return; }
    const controller = new AbortController();
    active = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
    const parts = button.dataset.parts.split(",");
    const original = button.innerHTML;
    button.textContent = "Cancelar download";
    status.textContent = "Baixando e reunindo o arquivo portátil.";
    try {
      const chunks = [];
      let received = 0;
      for (let index = 0; index < parts.length; index++) {
        let complete = false;
        for (let attempt = 0; attempt < 2 && !complete; attempt++) {
          const local = [];
          let size = 0;
          try {
            const response = await fetch(parts[index], { cache: "no-store", signal: controller.signal });
            if (!response.ok || !response.body) throw new Error("Parte indisponível");
            const reader = response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (received + size > 200 * 1048576) throw new Error("Arquivo excede o limite");
                local.push(value);
                status.textContent = `Parte ${index + 1} de ${parts.length} · ${((received + size) / 1048576).toFixed(1)} MiB recebidos. Clique para cancelar.`;
              }
            } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
            if (!size) throw new Error("Parte vazia");
            chunks.push(new Blob(local));
            received += size;
            complete = true;
          } catch (error) {
            if (controller.signal.aborted || attempt === 1) throw error;
          }
        }
      }
      status.textContent = "Conferindo a integridade do arquivo…";
      const file = new Blob(chunks, { type: "application/zip" });
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      if (controller.signal.aborted) throw new Error("Cancelado");
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
      if (actual !== button.dataset.sha256) throw new Error("O hash não corresponde");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = parts[0].split("/").pop().replace(/\.part\d+$/, "");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "Download iniciado. SHA-256 conferido.";
    } catch {
      status.textContent = controller.signal.aborted
        ? timedOut ? "O download excedeu 5 minutos. Tente novamente." : "Download cancelado. Você pode tentar novamente."
        : "Não foi possível conferir o download. Tente novamente; nenhum arquivo incompleto foi salvo.";
    } finally {
      clearTimeout(timer);
      active = null;
      button.innerHTML = original;
    }
  });
})();

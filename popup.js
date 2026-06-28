// popup.js
const statusEl = document.getElementById('status-msg');

// Revisar si la pestaña activa es el aula virtual
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const url = tab?.url || '';

  if (!url.includes('aulavirtual.pucv.cl')) {
    statusEl.innerHTML = `
      <span class="dim">No estás en el aula virtual.</span><br>
      <span class="dim">Navega a un curso para usar el descargador.</span>
    `;
    return;
  }

  // Ejecutar script en la pestaña para contar archivos detectados
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const links = document.querySelectorAll('a.aalink[href*="mod/resource/view.php"]');
      const panelExists = !!document.getElementById('pucv-dl-panel');
      return { count: links.length, panelVisible: panelExists };
    }
  }, (results) => {
    if (chrome.runtime.lastError || !results || !results[0]) {
      statusEl.innerHTML = `<span class="dim">No se pudo acceder a la página.</span>`;
      return;
    }

    const { count, panelVisible } = results[0].result;

    if (count === 0) {
      statusEl.innerHTML = `
        <span class="dim">No hay archivos en esta página.</span><br>
        <span class="dim">Navega a una sección con recursos.</span>
      `;
    } else {
      statusEl.innerHTML = `
        <span class="highlight">${count} archivo(s)</span> detectado(s) en esta página.<br>
        ${panelVisible
          ? '<span class="dim">El panel ya está visible.</span>'
          : '<span class="dim">Recarga la página si no ves el panel.</span>'
        }
      `;
    }
  });
});

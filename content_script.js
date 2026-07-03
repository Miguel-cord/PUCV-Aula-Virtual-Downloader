// content_script.js
// Detecta archivos en el Aula Virtual PUCV (Moodle) e inyecta un panel de descarga

// --- Configuración ---
const MOODLE_BASE = 'https://aulavirtual.pucv.cl';

// Íconos por tipo de archivo (emoji simples, sin dependencias)
const FILE_ICONS = {
  pdf:  '📄',
  docx: '📝', doc: '📝',
  xlsx: '📊', xls: '📊',
  pptx: '📑', ppt: '📑',
  zip:  '🗜️', rar: '🗜️', '7z': '🗜️',
  mp4:  '🎬', mkv: '🎬', avi: '🎬',
  mp3:  '🎵', wav: '🎵',
  default: '📎'
};

// --- Detectar links de recursos Moodle ---
function findResourceLinks() {
  // Moodle usa mod/resource/view.php?id=XXX para todos los archivos
  const links = document.querySelectorAll('a.aalink[href*="mod/resource/view.php"]');
  const files = [];

  links.forEach((link, index) => {
    // Extraer nombre limpio (sin el span "Archivo" oculto)
    const instanceSpan = link.querySelector('.instancename');
    let name = 'Archivo';
    if (instanceSpan) {
      // Clonar y quitar el span .accesshide para obtener solo el nombre visible
      const clone = instanceSpan.cloneNode(true);
      clone.querySelectorAll('.accesshide').forEach(el => el.remove());
      name = clone.textContent.trim();
    }

    // La URL con redirect=1 hace que Moodle redirija al archivo real
    const baseUrl = link.href;
    const downloadUrl = baseUrl.includes('?')
      ? baseUrl + '&redirect=1'
      : baseUrl + '?redirect=1';

    files.push({ id: index, name, url: downloadUrl, element: link });
  });

  return files;
}

// --- Inferir extensión desde el nombre o ícono del DOM ---
function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

// --- Crear e inyectar el panel flotante ---
function injectPanel(files) {
  // Evitar duplicados si el script se ejecuta dos veces
  if (document.getElementById('pucv-dl-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'pucv-dl-panel';

  panel.innerHTML = `
    <div id="pucv-dl-header" title="Clic para plegar/desplegar">
      <span>📥 PUCV Downloader</span>
      <div id="pucv-dl-header-buttons">
        <span id="pucv-dl-chevron">▲</span>
        <button id="pucv-dl-close" title="Cerrar">✕</button>
      </div>
    </div>

    <div id="pucv-dl-body">
      <div id="pucv-dl-controls">
        <label>
          <input type="checkbox" id="pucv-dl-select-all" checked>
          Seleccionar todo
        </label>
        <button id="pucv-dl-download-btn">
          ⬇ Descargar seleccionados
        </button>
      </div>

      <ul id="pucv-dl-list">
        ${files.map(f => `
          <li class="pucv-dl-item" data-id="${f.id}">
            <label>
              <input type="checkbox" class="pucv-dl-check" data-id="${f.id}" checked>
              <span class="pucv-dl-icon">${getFileIcon(f.name)}</span>
              <span class="pucv-dl-name" title="${f.name}">${f.name}</span>
            </label>
          </li>
        `).join('')}
      </ul>

      <div id="pucv-dl-status"></div>
    </div>
  `;

  document.body.appendChild(panel);
  attachPanelEvents(files, panel);
}

// --- Lógica de eventos del panel ---
function attachPanelEvents(files, panel) {
  const body       = panel.querySelector('#pucv-dl-body');
  const selectAll  = panel.querySelector('#pucv-dl-select-all');
  const checkboxes = () => panel.querySelectorAll('.pucv-dl-check');
  const statusEl   = panel.querySelector('#pucv-dl-status');

  // Plegar/desplegar al hacer clic en el header
  const chevron = panel.querySelector('#pucv-dl-chevron');
  panel.querySelector('#pucv-dl-header').addEventListener('click', (e) => {
    if (e.target.closest('#pucv-dl-close')) return;
    const collapsed = body.classList.toggle('pucv-dl-hidden');
    chevron.textContent = collapsed ? '▼' : '▲';
  });

  // Cerrar
  panel.querySelector('#pucv-dl-close').addEventListener('click', () => {
    panel.remove();
  });

  // Seleccionar todo / ninguno
  selectAll.addEventListener('change', () => {
    checkboxes().forEach(cb => cb.checked = selectAll.checked);
  });

  // Sincronizar "seleccionar todo" cuando se marca/desmarca individualmente
  panel.querySelector('#pucv-dl-list').addEventListener('change', () => {
    const all   = checkboxes();
    const checked = [...all].filter(cb => cb.checked);
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selectAll.checked = checked.length === all.length;
  });

  // Botón descargar
  panel.querySelector('#pucv-dl-download-btn').addEventListener('click', async () => {
    const selected = [...checkboxes()]
      .filter(cb => cb.checked)
      .map(cb => files.find(f => f.id === parseInt(cb.dataset.id)));

    if (selected.length === 0) {
      showStatus(statusEl, '⚠️ No hay archivos seleccionados', 'warn');
      return;
    }

    showStatus(statusEl, `⏳ Descargando ${selected.length} archivo(s)...`, 'info');

    // Pequeño delay entre descargas para no saturar el navegador
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      chrome.runtime.sendMessage({
        action: 'download',
        url: file.url,
        filename: file.name
      });
      if (i < selected.length - 1) {
        await delay(600);
      }
    }

    showStatus(statusEl, `✅ ${selected.length} descarga(s) iniciadas`, 'success');
  });
}

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `pucv-dl-status-${type}`;
  if (type === 'success') {
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Inicializar ---
function init() {
  const files = findResourceLinks();

  if (files.length === 0) return; // No hay archivos en esta página, no hacer nada

  injectPanel(files);
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

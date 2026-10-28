// content_script.js

const MOODLE_BASE = 'https://aulavirtual.pucv.cl';
const QUIZ_STORAGE_KEY = 'pucv_completed_quizzes';
const TIME_STORAGE_KEY = 'pucv_time_tracking';

const FILE_ICONS = {
  pdf: '📄', docx: '📝', doc: '📝', xlsx: '📊', xls: '📊',
  pptx: '📑', ppt: '📑', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  mp4: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵', default: '📎'
};

// ─── TEMA OSCURO / CLARO ──────────────────────────────────────────────────────

// Detecta si Moodle está en modo claro observando la clase del <html> o
// el icono visible del toggle .dm-toggle
function isMoodleLightMode() {
  const html = document.documentElement;
  // Moodle suele añadir clase 'light' / quitar clase 'dark' en el <html>
  if (html.classList.contains('light')) return true;
  if (html.classList.contains('dark'))  return false;
  // Fallback: si el span de "Modo claro" está oculto → estamos en claro
  const lightIcon = document.querySelector('.edw-icon-Light-mode');
  if (lightIcon) {
    const style = window.getComputedStyle(lightIcon);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  // Otra señal: fondo del body
  const bgColor = window.getComputedStyle(document.body).backgroundColor;
  if (bgColor) {
    const [r, g, b] = bgColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    return luminance > 128;
  }
  return false;
}

function applyPanelTheme() {
  const panel = document.getElementById('pucv-dl-panel');
  if (!panel) return;
  panel.classList.toggle('pucv-light-theme', isMoodleLightMode());
}

function watchMoodleTheme() {
  // Observar cambios de clase/atributo en <html> y <body>
  const observer = new MutationObserver(applyPanelTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

  // También escuchar clic en el toggle de Moodle directamente
  document.addEventListener('click', (e) => {
    if (e.target.closest('.dm-toggle')) {
      // Pequeño delay para que Moodle aplique el cambio antes de que lo leamos
      setTimeout(applyPanelTheme, 150);
      setTimeout(applyPanelTheme, 400);
    }
  }, true);
}

// ─── PANEL DE DESCARGA ───────────────────────────────────────────────────────

function findResourceLinks() {
  const links = document.querySelectorAll('a.aalink[href*="mod/resource/view.php"]');
  const files = [];
  links.forEach((link, index) => {
    const instanceSpan = link.querySelector('.instancename');
    let name = 'Archivo';
    if (instanceSpan) {
      const clone = instanceSpan.cloneNode(true);
      clone.querySelectorAll('.accesshide').forEach(el => el.remove());
      name = clone.textContent.trim();
    }
    const baseUrl = link.href;
    const downloadUrl = baseUrl.includes('?') ? baseUrl + '&redirect=1' : baseUrl + '?redirect=1';
    files.push({ id: index, name, url: downloadUrl });
  });
  return files;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function injectPanel(files) {
  if (document.getElementById('pucv-dl-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'pucv-dl-panel';
  panel.innerHTML = `
    <div id="pucv-dl-header" title="Clic para plegar/desplegar">
      <div id="pucv-dl-header-title">
        <span id="pucv-dl-icon-logo">⬇</span>
        <span>PUCV Downloader</span>
      </div>
      <div id="pucv-dl-header-buttons">
        <span id="pucv-dl-chevron">▼</span>
        <button id="pucv-dl-close" title="Cerrar">✕</button>
      </div>
    </div>
    <div id="pucv-dl-body" class="pucv-dl-hidden">
      <div id="pucv-dl-controls">
        <label id="pucv-dl-select-label">
          <input type="checkbox" id="pucv-dl-select-all" checked>
          <span>Seleccionar todo</span>
        </label>
        <button id="pucv-dl-download-btn">⬇ Descargar</button>
      </div>
      <ul id="pucv-dl-list">
        ${files.map(f => `
          <li class="pucv-dl-item" data-id="${f.id}">
            <label>
              <input type="checkbox" class="pucv-dl-check" data-id="${f.id}" checked>
              <span class="pucv-dl-icon">${getFileIcon(f.name)}</span>
              <span class="pucv-dl-name" title="${f.name}">${f.name}</span>
            </label>
          </li>`).join('')}
      </ul>
      <div id="pucv-dl-progress" class="pucv-dl-hidden">
        <div id="pucv-dl-progress-bar"><div id="pucv-dl-progress-fill"></div></div>
        <span id="pucv-dl-progress-label"></span>
      </div>
      <div id="pucv-dl-status"></div>
    </div>`;
  document.body.appendChild(panel);
  attachPanelEvents(files, panel);
  applyPanelTheme();
  watchMoodleTheme();
}

function attachPanelEvents(files, panel) {
  const body = panel.querySelector('#pucv-dl-body');
  const selectAll = panel.querySelector('#pucv-dl-select-all');
  const checkboxes = () => panel.querySelectorAll('.pucv-dl-check');
  const statusEl = panel.querySelector('#pucv-dl-status');
  const chevron = panel.querySelector('#pucv-dl-chevron');

  panel.querySelector('#pucv-dl-header').addEventListener('click', (e) => {
    if (e.target.closest('#pucv-dl-close')) return;
    const collapsed = body.classList.toggle('pucv-dl-hidden');
    chevron.textContent = collapsed ? '▼' : '▲';
  });

  panel.querySelector('#pucv-dl-close').addEventListener('click', () => panel.remove());

  selectAll.addEventListener('change', () => {
    checkboxes().forEach(cb => cb.checked = selectAll.checked);
  });

  panel.querySelector('#pucv-dl-list').addEventListener('change', () => {
    const all = checkboxes();
    const checked = [...all].filter(cb => cb.checked);
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selectAll.checked = checked.length === all.length;
  });

  const downloadBtn = panel.querySelector('#pucv-dl-download-btn');
  const progressEl = panel.querySelector('#pucv-dl-progress');
  const progressFill = panel.querySelector('#pucv-dl-progress-fill');
  const progressLabel = panel.querySelector('#pucv-dl-progress-label');

  downloadBtn.addEventListener('click', async () => {
    const selected = [...checkboxes()]
      .filter(cb => cb.checked)
      .map(cb => files.find(f => f.id === parseInt(cb.dataset.id)));

    if (!selected.length) { showStatus(statusEl, '⚠️ Nada seleccionado', 'warn'); return; }

    if (selected.length === 1) {
      chrome.runtime.sendMessage({ action: 'download', url: selected[0].url });
      showStatus(statusEl, '✅ Descarga iniciada', 'success');
      return;
    }

    downloadBtn.disabled = true;
    progressEl.classList.remove('pucv-dl-hidden');

    const zip = new JSZip();
    let done = 0;
    const errors = [];

    for (const file of selected) {
      progressLabel.textContent = `Empaquetando ${done + 1}/${selected.length}: ${file.name}`;
      setProgress(progressFill, done / selected.length);
      try {
        const res = await fetch(file.url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const disposition = res.headers.get('Content-Disposition');
        const realName = extractFilename(disposition) || sanitizeFilename(file.name);
        zip.file(realName, await res.blob());
      } catch (err) { errors.push(file.name); }
      done++;
      setProgress(progressFill, done / selected.length);
    }

    progressLabel.textContent = 'Generando ZIP...';
    try {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl; a.download = 'archivos_pucv.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      showStatus(statusEl, `✅ ZIP listo — ${done - errors.length} archivo(s)`, 'success');
    } catch { showStatus(statusEl, '❌ Error al generar ZIP', 'warn'); }

    progressEl.classList.add('pucv-dl-hidden');
    downloadBtn.disabled = false;
  });
}

function showStatus(el, msg, type) {
  el.textContent = msg; el.className = `pucv-dl-status-${type}`;
  if (type === 'success') setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}
function setProgress(el, r) { el.style.width = `${Math.round(r * 100)}%`; }
function extractFilename(d) {
  if (!d) return null;
  const m = d.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/i);
  if (!m) return null;
  const raw = m[1] ? decodeURIComponent(m[1]) : m[2];
  return raw ? sanitizeFilename(raw) : null;
}
function sanitizeFilename(n) { return n.replace(/[/\\?%*:|"<>]/g, '-').trim(); }

function init() {
  const files = findResourceLinks();
  if (files.length > 0) injectPanel(files);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// ─── REGISTRO DE TIEMPO POR CURSO ────────────────────────────────────────────

function getCourseId() {
  // 1. Página directa del curso (/course/view.php?id=X)
  if (window.location.pathname.includes('/course/view.php')) {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) return id;
  }
  // 2. Variable global de Moodle (disponible en quiz, recursos, foros, etc.)
  try {
    if (window.M?.cfg?.courseId && window.M.cfg.courseId !== 1) {
      return String(window.M.cfg.courseId);
    }
  } catch { /* ignorar */ }
  // 3. Breadcrumb con enlace al curso (fallback robusto)
  const bcLink = document.querySelector(
    '.breadcrumb a[href*="course/view.php"], ' +
    'nav[aria-label] a[href*="course/view.php"], ' +
    '#nav-breadcrumb a[href*="course/view.php"]'
  );
  if (bcLink) {
    try {
      const id = new URL(bcLink.href).searchParams.get('id');
      if (id) return id;
    } catch { /* ignorar */ }
  }
  return null;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getCourseName() {
  // Preferir el breadcrumb: apunta al curso, no a la página actual
  const bcLink = document.querySelector(
    '.breadcrumb a[href*="course/view.php"], ' +
    'nav[aria-label] a[href*="course/view.php"], ' +
    '#nav-breadcrumb a[href*="course/view.php"]'
  );
  if (bcLink) return bcLink.textContent.trim();
  const heading = document.querySelector('h1, .page-header-headings h1, .page-header h1');
  return heading?.textContent?.trim() || document.title.split('|')[0].trim() || `Curso ${getCourseId()}`;
}

async function initTimeTracking() {
  const courseId = getCourseId();
  if (!courseId) return;

  const sessionStart = Date.now();
  let saved = false;

  const saveSession = async () => {
    if (saved) return;
    const elapsed = Date.now() - sessionStart;
    if (elapsed < 5000) return; // ignorar visitas de menos de 5 segundos

    saved = true;
    const result = await chrome.storage.local.get(TIME_STORAGE_KEY);
    const tracking = result[TIME_STORAGE_KEY] || {};

    if (!tracking[courseId]) {
      tracking[courseId] = { name: getCourseName(), totalMs: 0, sessions: 0, lastVisit: null };
    }

    tracking[courseId].totalMs += elapsed;
    tracking[courseId].sessions += 1;
    tracking[courseId].lastVisit = new Date().toISOString();
    // Actualizar nombre por si cambió
    tracking[courseId].name = getCourseName();

    await chrome.storage.local.set({ [TIME_STORAGE_KEY]: tracking });
  };

  // Guardar al salir / cambiar pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saved = false; // permitir re-guardar si vuelve
      saveSession();
    } else {
      // Al volver a la pestaña, reiniciar contador de sesión
      // (la sesión anterior ya fue guardada)
    }
  });
  window.addEventListener('beforeunload', saveSession);
}

// ─── QUIZ CHECKS + AUTO-DETECCIÓN + EXPORTAR ─────────────────────────────────

function getQuizIdFromUrl(url) {
  try { return new URL(url).searchParams.get('id'); } catch { return null; }
}

// Detección mejorada: verifica múltiples señales en el HTML
function quizHtmlIsFinalized(html) {
  // Señal 1: texto "Finalizado" (el más fiable)
  if (!html.includes('Finalizado')) return false;

  // Señal 2: confirmar con al menos una de estas:
  return (
    html.includes('quizsummaryofattempts') ||
    html.includes('attemptreviewsummary') ||
    html.includes('Calificación') ||
    html.includes('Puntos') ||
    html.includes('review.php') ||       // hay enlace de revisión
    html.includes('startattempt')        // botón de reintentar
  );
}

// Auto-detección en segundo plano.
// Re-corre si cambian las tabs de Moodle (se llama desde el observer).
let autoDetectRunning = false;
async function autoDetectQuizzes() {
  if (!window.location.pathname.includes('/course/view.php')) return;
  if (autoDetectRunning) return;

  const links = [...document.querySelectorAll('a.aalink[href*="mod/quiz/view.php"]')];
  if (!links.length) return;

  const result = await chrome.storage.local.get(QUIZ_STORAGE_KEY);
  const store = result[QUIZ_STORAGE_KEY] || {};

  // Procesar los que no se han revisado todavía (undefined) o los que
  // están marcados como false para re-verificar (pueden haberse completado)
  const pending = links
    .map(l => ({ id: getQuizIdFromUrl(l.href), url: l.href }))
    .filter(q => q.id && store[q.id] !== true); // omitir solo los ya confirmados

  if (!pending.length) return;

  autoDetectRunning = true;
  let changed = false;

  for (const quiz of pending) {
    try {
      const res = await fetch(quiz.url, { credentials: 'include' });
      if (!res.ok) continue;
      const html = await res.text();
      const done = quizHtmlIsFinalized(html);
      if (done && !store[quiz.id]) {
        store[quiz.id] = true;
        changed = true;
      } else if (!done) {
        store[quiz.id] = false;
      }
    } catch { /* ignorar errores de red */ }
    await new Promise(r => setTimeout(r, 300));
  }

  await chrome.storage.local.set({ [QUIZ_STORAGE_KEY]: store });
  autoDetectRunning = false;
  if (changed) applyQuizChecks();
}

// Exportar enunciados del cuestionario como HTML
async function exportQuizQuestions(quizId, quizName, exportBtn) {
  exportBtn.textContent = '⏳';
  exportBtn.disabled = true;

  try {
    const quizUrl = `${MOODLE_BASE}/mod/quiz/view.php?id=${quizId}`;
    const res = await fetch(quizUrl, { credentials: 'include' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const reviewLink =
      doc.querySelector('a[href*="mod/quiz/review.php"]') ||
      doc.querySelector('a[href*="review.php"]');

    if (!reviewLink) {
      alert('No se encontró revisión. ¿Has completado el cuestionario?');
      return;
    }

    const reviewUrl = reviewLink.href.startsWith('http')
      ? reviewLink.href
      : `${MOODLE_BASE}${reviewLink.getAttribute('href')}`;

    const reviewRes = await fetch(reviewUrl, { credentials: 'include' });
    const reviewHtml = await reviewRes.text();
    const reviewDoc = new DOMParser().parseFromString(reviewHtml, 'text/html');

    const questions = reviewDoc.querySelectorAll('.que');
    if (!questions.length) {
      alert('No se pudieron extraer las preguntas. La revisión podría no estar disponible.');
      return;
    }

    let questionsHtml = '';
    questions.forEach((que, i) => {
      const qtext = que.querySelector('.qtext, .formulation, .content');
      const numEl = que.querySelector('.no, h2, h3');
      const numText = numEl ? numEl.textContent.trim() : `Pregunta ${i + 1}`;
      if (!qtext) return;

      const qtextClone = qtext.cloneNode(true);
      qtextClone.querySelectorAll('img').forEach(img => { if (img.src) img.src = img.src; });

      questionsHtml += `
        <div class="question">
          <div class="question-number">${numText}</div>
          <div class="question-text">${qtextClone.innerHTML}</div>
        </div>`;
    });

    const output = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${quizName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8f9fa; color: #1a1a2e; padding: 40px 20px; }
    .container { max-width: 820px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; color: #0059ff; border-bottom: 2px solid #0059ff; padding-bottom: 12px; margin-bottom: 28px; }
    .question { background: #fff; border: 1px solid #e0e4ef; border-left: 4px solid #0059ff; border-radius: 8px; padding: 20px 24px; margin-bottom: 18px; }
    .question-number { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #0059ff; margin-bottom: 10px; }
    .question-text { font-size: 15px; line-height: 1.65; color: #2d2d2d; }
    .question-text img { max-width: 100%; border-radius: 6px; margin-top: 10px; }
    .footer { text-align: center; font-size: 12px; color: #999; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${quizName}</h1>
    ${questionsHtml}
    <div class="footer">Exportado desde PUCV Aula Virtual Downloader</div>
  </div>
</body>
</html>`;

    const blob = new Blob([output], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(quizName)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

  } catch (err) {
    console.error('[PUCV] Export error:', err);
    alert('Error al exportar. Intenta de nuevo.');
  } finally {
    exportBtn.textContent = '📄';
    exportBtn.disabled = false;
  }
}

function injectQuizButtons(linkEl, quizId, quizName, completed) {
  if (linkEl.parentElement.querySelector('.pucv-quiz-actions')) return;

  const wrapper = document.createElement('span');
  wrapper.className = 'pucv-quiz-actions';

  const checkBtn = document.createElement('button');
  checkBtn.className = 'pucv-quiz-check' + (completed ? ' pucv-quiz-done' : '');
  checkBtn.dataset.quizId = quizId;
  checkBtn.title = completed ? 'Completado — clic para desmarcar' : 'Marcar como completado';
  checkBtn.innerHTML = completed
    ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,8.5 6.5,12.5 13.5,4"/></svg>'
    : '';

  checkBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    chrome.storage.local.get(QUIZ_STORAGE_KEY, (result) => {
      const store = result[QUIZ_STORAGE_KEY] || {};
      const nowDone = !store[quizId];
      if (nowDone) store[quizId] = true; else delete store[quizId];
      chrome.storage.local.set({ [QUIZ_STORAGE_KEY]: store });
      checkBtn.classList.toggle('pucv-quiz-done', nowDone);
      checkBtn.title = nowDone ? 'Completado — clic para desmarcar' : 'Marcar como completado';
      checkBtn.innerHTML = nowDone
        ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,8.5 6.5,12.5 13.5,4"/></svg>'
        : '';
    });
  });

  const exportBtn = document.createElement('button');
  exportBtn.className = 'pucv-quiz-export';
  exportBtn.title = 'Exportar enunciados';
  exportBtn.textContent = '📄';
  exportBtn.dataset.exportId = quizId;

  exportBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    exportQuizQuestions(quizId, quizName, exportBtn);
  });

  wrapper.appendChild(checkBtn);
  wrapper.appendChild(exportBtn);
  linkEl.parentElement.appendChild(wrapper);
}

function applyQuizChecks() {
  if (!window.location.pathname.includes('/course/view.php')) return;

  const quizLinks = document.querySelectorAll('a.aalink[href*="mod/quiz/view.php"]');
  if (!quizLinks.length) return;

  chrome.storage.local.get(QUIZ_STORAGE_KEY, (result) => {
    const store = result[QUIZ_STORAGE_KEY] || {};
    quizLinks.forEach(link => {
      const quizId = getQuizIdFromUrl(link.href);
      if (!quizId) return;
      const instanceSpan = link.querySelector('.instancename');
      const clone = instanceSpan?.cloneNode(true);
      clone?.querySelectorAll('.accesshide').forEach(el => el.remove());
      const quizName = clone?.textContent.trim() || `Cuestionario ${quizId}`;
      injectQuizButtons(link, quizId, quizName, !!store[quizId]);
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function initQuiz() {
  applyQuizChecks();
  // Auto-detectar en segundo plano
  setTimeout(autoDetectQuizzes, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initQuiz(); initTimeTracking(); });
} else {
  initQuiz();
  initTimeTracking();
}

// Observer para tabs dinámicas de Moodle
let quizDebounce = null;
let autoDetectDebounce = null;
const quizObserver = new MutationObserver(() => {
  clearTimeout(quizDebounce);
  quizDebounce = setTimeout(applyQuizChecks, 300);

  // Re-lanzar auto-detección si hay nuevos quizzes en el DOM
  clearTimeout(autoDetectDebounce);
  autoDetectDebounce = setTimeout(autoDetectQuizzes, 2000);
});
quizObserver.observe(document.body, { childList: true, subtree: true });

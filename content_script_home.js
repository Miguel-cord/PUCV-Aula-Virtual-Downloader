// content_script_home.js — document_start
// Usa chrome.storage.local (inmune a Moodle) + MutationObserver agresivo

const STORAGE_KEY     = 'pucv_hidden_courses';
const TIME_STORAGE_KEY = 'pucv_time_tracking';
let hiddenCourses = {};   // cache en memoria, se llena desde chrome.storage
let showingHidden  = false;

// ── <style> inyectado inmediatamente en <html> ──────────────────────────────
const styleEl = document.createElement('style');
styleEl.id = 'pucv-hidden-styles';
document.documentElement.appendChild(styleEl);

function buildCSS() {
  const ids = Object.keys(hiddenCourses);
  if (!ids.length) return '';
  return ids.map(id =>
    showingHidden
      ? `[data-course-id="${id}"]{opacity:.35!important;filter:grayscale(60%)!important;transition:opacity .2s,filter .2s!important}
         [data-course-id="${id}"]:hover{opacity:.65!important;filter:grayscale(20%)!important}`
      : `[data-course-id="${id}"]{display:none!important}`
  ).join('\n');
}

function applyCSS() {
  styleEl.textContent = buildCSS();
}

// También oculta inline cada tarjeta visible para ser doblemente seguros
function applyInline() {
  document.querySelectorAll('[data-course-id]').forEach(card => {
    const id = card.dataset.courseId;
    if (hiddenCourses[id] && !showingHidden) {
      card.style.setProperty('display', 'none', 'important');
    } else if (hiddenCourses[id] && showingHidden) {
      card.style.removeProperty('display');
    } else {
      card.style.removeProperty('display');
    }
  });
}

function applyVisibility() {
  applyCSS();
  applyInline();
}

// ── MutationObserver agresivo desde document_start ──────────────────────────
// Oculta cada tarjeta en el INSTANTE que aparece en el DOM, sin esperar nada
const earlyObserver = new MutationObserver((mutations) => {
  if (!Object.keys(hiddenCourses).length) return;
  mutations.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      // Nodo directo
      if (node.dataset?.courseId && hiddenCourses[node.dataset.courseId] && !showingHidden) {
        node.style.setProperty('display', 'none', 'important');
      }
      // Hijos
      node.querySelectorAll?.('[data-course-id]').forEach(card => {
        if (hiddenCourses[card.dataset.courseId] && !showingHidden) {
          card.style.setProperty('display', 'none', 'important');
        }
      });
    });
  });
});

earlyObserver.observe(document.documentElement, { childList: true, subtree: true });

// ── chrome.storage.local ─────────────────────────────────────────────────────
function loadStorage(cb) {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    hiddenCourses = result[STORAGE_KEY] || {};
    cb?.();
  });
}

function saveStorage() {
  chrome.storage.local.set({ [STORAGE_KEY]: hiddenCourses });
}

// Cargar storage lo antes posible y aplicar CSS inmediatamente
loadStorage(() => {
  applyVisibility();
});

// ── Ocultar / restaurar ──────────────────────────────────────────────────────
function hideCourse(courseId, courseName) {
  hiddenCourses[courseId] = courseName;
  saveStorage();
  applyVisibility();
  updateToggleBtn();
}

function restoreCourse(courseId) {
  delete hiddenCourses[courseId];
  saveStorage();
  applyVisibility();
  updateToggleBtn();
}

// ── Menú "..." ───────────────────────────────────────────────────────────────
function injectMenuOption(card) {
  if (card.querySelector('.pucv-hide-btn')) return;
  const dropdownMenu = card.querySelector('.dropdown-menu');
  if (!dropdownMenu) return;

  const courseId   = card.dataset.courseId;
  const nameEl     = card.querySelector('.coursename .multiline, .coursename');
  const courseName = nameEl ? nameEl.textContent.trim() : `Curso ${courseId}`;

  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';

  const btn = document.createElement('a');
  btn.className  = 'dropdown-item pucv-hide-btn';
  btn.href       = '#';
  btn.textContent = hiddenCourses[courseId] ? '👁 Mostrar curso' : '🙈 Ocultar curso';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hiddenCourses[courseId]) {
      restoreCourse(courseId);
      btn.textContent = '🙈 Ocultar curso';
    } else {
      hideCourse(courseId, courseName);
      btn.textContent = '👁 Mostrar curso';
    }
    dropdownMenu.classList.remove('show');
    card.querySelector('[data-toggle="dropdown"]')?.setAttribute('aria-expanded', 'false');
  });

  dropdownMenu.appendChild(divider);
  dropdownMenu.appendChild(btn);
}

// ── Botón toggle ─────────────────────────────────────────────────────────────
function injectToggleBtn() {
  if (document.getElementById('pucv-toggle-hidden')) return;

  const btn = document.createElement('button');
  btn.id        = 'pucv-toggle-hidden';
  btn.className = 'pucv-toggle-btn';

  btn.addEventListener('click', () => {
    showingHidden = !showingHidden;
    applyVisibility();
    updateToggleBtn();
  });

  const anchor =
    document.querySelector('.my-index .mb-3') ||
    document.querySelector('[data-region="courses-view"]')?.parentElement ||
    document.querySelector('.block_myoverview .card-body') ||
    null;

  if (anchor) {
    anchor.insertAdjacentElement('afterbegin', btn);
  } else {
    Object.assign(btn.style, { position:'fixed', top:'70px', right:'20px', zIndex:'99998' });
    document.body.appendChild(btn);
  }

  updateToggleBtn();
}

function updateToggleBtn() {
  const btn   = document.getElementById('pucv-toggle-hidden');
  if (!btn) return;
  const count = Object.keys(hiddenCourses).length;
  if (count === 0) {
    btn.style.display = 'none';
    if (showingHidden) { showingHidden = false; applyVisibility(); }
    return;
  }
  btn.style.display = 'inline-flex';
  btn.textContent   = showingHidden
    ? `🙈 Ocultar (${count} curso${count !== 1 ? 's' : ''})`
    : `👁 Mostrar ocultos (${count})`;
}

// ── Registro de tiempo: badges en tarjetas ───────────────────────────────────

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

// ─── Sección de tiempo al fondo de la página ─────────────────────────────────

let timeSectionInjected = false;

async function injectTimeSection() {
  if (timeSectionInjected) return;

  const result = await chrome.storage.local.get(TIME_STORAGE_KEY);
  const tracking = result[TIME_STORAGE_KEY] || {};

  // Solo cursos con datos reales (>5 segundos)
  const entries = Object.entries(tracking)
    .filter(([, d]) => d && d.totalMs >= 5000)
    .sort((a, b) => (b[1].totalMs || 0) - (a[1].totalMs || 0)); // más tiempo primero

  if (!entries.length) return;

  // Buscar punto de inserción justo antes del footer
  const anchor =
    document.querySelector('#page-footer') ||
    document.querySelector('footer') ||
    document.querySelector('.footer') ||
    null;

  if (!anchor) return;

  // Evitar doble inyección
  if (document.getElementById('pucv-time-section')) return;
  timeSectionInjected = true;

  const section = document.createElement('div');
  section.id = 'pucv-time-section';

  const rows = entries.map(([id, d]) => {
    const lastDate = d.lastVisit
      ? new Date(d.lastVisit).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
      : '—';
    const name = d.name || `Curso ${id}`;
    const pct = Math.min(100, Math.round((d.totalMs / (entries[0][1].totalMs || 1)) * 100));
    return `
      <div class="pucv-time-row">
        <div class="pucv-time-row-info">
          <span class="pucv-time-row-name" title="${name}">${name}</span>
          <div class="pucv-time-row-bar-wrap">
            <div class="pucv-time-row-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="pucv-time-row-meta">
          <span class="pucv-time-row-total">${formatDuration(d.totalMs)}</span>
          <span class="pucv-time-row-sessions">${d.sessions} ses.</span>
          <span class="pucv-time-row-last">${lastDate}</span>
        </div>
      </div>`;
  }).join('');

  section.innerHTML = `
    <div class="pucv-time-header">
      <span class="pucv-time-header-icon">⏱</span>
      <span class="pucv-time-header-title">Tiempo en el Aula Virtual</span>
    </div>
    <div class="pucv-time-list">${rows}</div>`;

  anchor.insertAdjacentElement('beforebegin', section);
}

// ── Limpiar cursos fantasma (eliminados por la PUCV) ─────────────────────────
// Espera a que Moodle cargue todas las tarjetas y luego elimina del storage
// los IDs que ya no tienen ningún elemento [data-course-id] en el DOM.
function cleanupGhostCourses() {
  setTimeout(() => {
    const presentIds = new Set(
      [...document.querySelectorAll('[data-course-id]')].map(c => c.dataset.courseId)
    );
    const ghosts = Object.keys(hiddenCourses).filter(id => !presentIds.has(id));
    if (!ghosts.length) return;
    ghosts.forEach(id => delete hiddenCourses[id]);
    saveStorage();
    applyVisibility();
    updateToggleBtn();
  }, 4000); // esperar 4s para que Moodle termine de renderizar
}

// ── Init (DOM listo) ─────────────────────────────────────────────────────────
let debounceTimer = null;

function processCards() {
  document.querySelectorAll('.card[data-course-id]').forEach(injectMenuOption);
  updateToggleBtn();
}

function init() {
  applyVisibility();
  injectToggleBtn();
  processCards();
  cleanupGhostCourses();

  // Inyectar sección de tiempo cuando el DOM esté más estable
  setTimeout(injectTimeSection, 2000);

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processCards, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', init);

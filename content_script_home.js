// content_script_home.js
// Gestiona la visibilidad de cursos en la página principal del Aula Virtual PUCV

const STORAGE_KEY = 'pucv_hidden_courses';
let showingHidden = false;

// --- LocalStorage helpers ---

function getHiddenCourses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveHiddenCourses(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// --- Ocultar / mostrar un curso ---

function hideCourse(courseId, courseName) {
  const hidden = getHiddenCourses();
  hidden[courseId] = courseName;
  saveHiddenCourses(hidden);
  applyVisibility();
  updateToggleBtn();
}

function restoreCourse(courseId) {
  const hidden = getHiddenCourses();
  delete hidden[courseId];
  saveHiddenCourses(hidden);
  applyVisibility();
  updateToggleBtn();
}

// --- Aplicar visibilidad a todas las tarjetas ---

function applyVisibility() {
  const hidden = getHiddenCourses();
  document.querySelectorAll('.card[data-course-id]').forEach(card => {
    const id = card.dataset.courseId;
    const isHidden = !!hidden[id];

    card.classList.toggle('pucv-course-hidden', isHidden && !showingHidden);
    card.classList.toggle('pucv-course-dimmed', isHidden && showingHidden);

    // Actualizar texto del botón en el menú si ya fue inyectado
    const btn = card.querySelector('.pucv-hide-btn');
    if (btn) btn.textContent = isHidden ? '👁 Mostrar curso' : '🙈 Ocultar curso';
  });
}

// --- Inyectar opción en el menú "..." de cada tarjeta ---

function injectMenuOption(card) {
  if (card.querySelector('.pucv-hide-btn')) return; // Ya inyectado

  const dropdownMenu = card.querySelector('.dropdown-menu');
  if (!dropdownMenu) return;

  const courseId = card.dataset.courseId;
  const nameEl   = card.querySelector('.coursename .multiline, .coursename');
  const courseName = nameEl ? nameEl.textContent.trim() : `Curso ${courseId}`;

  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';

  const btn = document.createElement('a');
  btn.className = 'dropdown-item pucv-hide-btn';
  btn.href = '#';
  btn.textContent = getHiddenCourses()[courseId] ? '👁 Mostrar curso' : '🙈 Ocultar curso';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isCurrentlyHidden = !!getHiddenCourses()[courseId];
    if (isCurrentlyHidden) {
      restoreCourse(courseId);
    } else {
      hideCourse(courseId, courseName);
    }
    // Cerrar el dropdown de Moodle
    dropdownMenu.classList.remove('show');
    card.querySelector('[data-toggle="dropdown"]')?.setAttribute('aria-expanded', 'false');
  });

  dropdownMenu.appendChild(divider);
  dropdownMenu.appendChild(btn);
}

// --- Botón toggle "Mostrar/Ocultar ocultos" ---

function injectToggleBtn() {
  if (document.getElementById('pucv-toggle-hidden')) return;

  const btn = document.createElement('button');
  btn.id = 'pucv-toggle-hidden';
  btn.className = 'pucv-toggle-btn';

  btn.addEventListener('click', () => {
    showingHidden = !showingHidden;
    applyVisibility();
    updateToggleBtn();
  });

  // Intentar inyectar junto a los filtros de búsqueda
  const anchor =
    document.querySelector('.my-index .mb-3') ||
    document.querySelector('[data-region="courses-view"]')?.parentElement ||
    document.querySelector('.block_myoverview .card-body') ||
    null;

  if (anchor) {
    anchor.insertAdjacentElement('afterbegin', btn);
  } else {
    // Fallback: posición fija debajo del header
    btn.style.position = 'fixed';
    btn.style.top = '70px';
    btn.style.right = '20px';
    btn.style.zIndex = '99998';
    document.body.appendChild(btn);
  }

  updateToggleBtn();
}

function updateToggleBtn() {
  const btn = document.getElementById('pucv-toggle-hidden');
  if (!btn) return;

  const count = Object.keys(getHiddenCourses()).length;

  if (count === 0) {
    btn.style.display = 'none';
    // Si no hay ocultos y estábamos mostrándolos, resetear
    if (showingHidden) {
      showingHidden = false;
      applyVisibility();
    }
    return;
  }

  btn.style.display = 'inline-flex';
  btn.textContent = showingHidden
    ? `🙈 Ocultar (${count} curso${count !== 1 ? 's' : ''})`
    : `👁 Mostrar ocultos (${count})`;
}

// --- Init ---

function init() {
  injectToggleBtn();

  document.querySelectorAll('.card[data-course-id]').forEach(card => injectMenuOption(card));
  applyVisibility();
  updateToggleBtn();

  // Observer para tarjetas cargadas dinámicamente (lazy load de Moodle)
  const container =
    document.querySelector('[data-region="courses-view"]') ||
    document.querySelector('.dashboard-card-deck') ||
    document.querySelector('main');

  if (container) {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.card[data-course-id]').forEach(card => injectMenuOption(card));
      applyVisibility();
    });
    observer.observe(container, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// content_script_quiz.js
// Corre en páginas de cuestionario (mod/quiz/view.php)
// Detecta si el quiz está finalizado y lo guarda en chrome.storage

const STORAGE_KEY = 'pucv_completed_quizzes';

function getQuizId() {
  return new URLSearchParams(window.location.search).get('id');
}

function isFinalized() {
  const bodyText = document.body.innerText || '';

  // Condición 1: la palabra "Finalizado" debe aparecer en la página
  if (!bodyText.includes('Finalizado')) return false;

  // Condición 2: al menos una de estas señales confirma que es un intento completado:
  // - Existe tabla de resumen de intentos
  // - Existe sección de calificación
  // - Botón de reintentar (solo aparece tras enviar)
  const hasAttemptSummary = !!document.querySelector(
    '.quizsummaryofattempts, .attemptreviewsummary, .quizreviewsummary, ' +
    '[class*="attempt"], .generaltable'
  );
  const hasGrade = bodyText.includes('Calificación') || bodyText.includes('Puntos');
  const hasRetryBtn = !!document.querySelector(
    'a[href*="startattempt"], button[type="submit"], .singlebutton'
  );

  return hasAttemptSummary || hasGrade || hasRetryBtn;
}

function saveCompleted(quizId) {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const completed = result[STORAGE_KEY] || {};
    if (!completed[quizId]) {
      completed[quizId] = true;
      chrome.storage.local.set({ [STORAGE_KEY]: completed });
    }
  });
}

function init() {
  const quizId = getQuizId();
  if (!quizId) return;

  if (isFinalized()) {
    saveCompleted(quizId);
    return;
  }

  // Si la tabla aún no cargó, observar el DOM
  const observer = new MutationObserver(() => {
    if (isFinalized()) {
      saveCompleted(quizId);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

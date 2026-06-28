// background.js
// Service worker: recibe mensajes del content script y ejecuta las descargas

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    chrome.downloads.download({
      url: message.url,
      // No forzamos filename aquí: Moodle manda el header Content-Disposition
      // con el nombre real del archivo (ej: "Python - LISTAS - parte 1.pdf")
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[PUCV Downloader] Error:', chrome.runtime.lastError.message);
      } else {
        console.log('[PUCV Downloader] Descarga iniciada, ID:', downloadId);
      }
    });
  }
});

(function () {
  'use strict';
  let installPrompt = null;

  if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(error => {
        console.warn('Service worker registration failed:', error?.message || error);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    document.querySelectorAll('[data-install-app]').forEach(button => { button.hidden = false; });
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-install-app]');
    if (!button || !installPrompt) return;
    button.disabled = true;
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    finally { installPrompt = null; button.hidden = true; button.disabled = false; }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.querySelectorAll('[data-install-app]').forEach(button => { button.hidden = true; });
  });
}());

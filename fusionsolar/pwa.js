/* Registers an isolated service worker only for the public HTTPS static demo. */
(function() {
  'use strict';
  const host=location.hostname;
  if (!window.isSecureContext || !('serviceWorker' in navigator) ||
      ['localhost','127.0.0.1','[::1]'].includes(host)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'})
      .then(registration => registration.update().catch(()=>{}))
      .catch(error=>console.info('Offline PWA not available:',String(error)));
  }, {once:true});
})();

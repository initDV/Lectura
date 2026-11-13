// Garde-fou chargé AVANT les modules : si l'application ne démarre pas (navigateur trop ancien,
// fichier manquant…), on affiche un message clair au lieu d'un écran figé. Aucun échec silencieux.
(function () {
  'use strict';
  function fail(detail) {
    if (window.__lecturaPret) return;
    var p = document.querySelector('#app .boot');
    if (!p) return;
    p.className = 'boot boot-error';
    p.textContent =
      "Lectura n'a pas pu démarrer. Vérifie ta connexion pour la première visite, puis recharge la page. " +
      'Navigateurs conseillés : Chrome, Edge ou Samsung Internet récents.' +
      (detail ? ' (Détail : ' + detail + ')' : '');
  }
  window.addEventListener('error', function (e) {
    if (!window.__lecturaPret) fail(e && e.message ? e.message : 'erreur de chargement');
  });
  setTimeout(function () {
    fail('délai de démarrage dépassé');
  }, 12000);
})();

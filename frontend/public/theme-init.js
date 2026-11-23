// Applique le thème sombre avant l'affichage de la page (évite un flash clair).
// Fichier séparé : la politique de sécurité du serveur interdit les scripts en ligne.
(function () {
  try {
    var theme = localStorage.getItem('app_theme') || 'SYSTEM';
    var isDark = theme === 'DARK' || (theme === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#0B1528');
    }
  } catch (e) {
    // Stockage indisponible : thème clair par défaut.
  }
})();

// Applies the saved theme before first paint to avoid a light/dark flash.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('qr-studio:settings') || '{}');
    if (s.theme === 'light' || s.theme === 'dark') document.documentElement.dataset.theme = s.theme;
  } catch (e) {
    // Storage unavailable: fall back to the system theme.
  }
})();

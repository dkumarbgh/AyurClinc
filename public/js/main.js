document.addEventListener('DOMContentLoaded', () => {
  App.initShellEvents();
  if (Api.getToken()) {
    App.showApp();
  } else {
    App.showLogin();
  }
});

const App = (() => {
  const ROLE_LABELS = { admin: 'Admin', front_desk: 'Front desk', therapist: 'Therapist' };

  const routes = {
    dashboard: () => Views.Dashboard.render(),
    patients: () => Views.Patients.render(),
    vaccinations: () => Views.Vaccinations.render(),
    'swarna-prashana': () => Views.SwarnaPrashana.render(),
    rooms: () => Views.Rooms.render(),
    therapists: () => Views.Therapists.render(),
    fees: () => Views.Fees.render(),
    documents: () => Views.Documents.render(),
    whatsapp: () => Views.Whatsapp.render(),
    users: () => Views.Users.render(),
    'audit-log': () => Views.AuditLog.render(),
    settings: () => Views.Settings.render(),
  };

  function currentUser() {
    return Api.getUser();
  }

  function showLogin() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }

  /** Shows/hides nav items and route access based on the signed-in user's role. */
  function applyRoleVisibility() {
    const user = currentUser();
    const role = user ? user.role : null;

    const navFees = document.querySelector('.nav-item[data-route="fees"]');
    if (navFees) navFees.classList.toggle('hidden', role === 'therapist');

    document.getElementById('nav-users').classList.toggle('hidden', role !== 'admin');
    document.getElementById('nav-audit-log').classList.toggle('hidden', role !== 'admin');
    document.getElementById('nav-settings').classList.toggle('hidden', role !== 'admin');

    document.getElementById('current-user-label').textContent =
      user ? `${user.full_name || user.username} \u00b7 ${ROLE_LABELS[user.role] || user.role}` : 'Signed in';
  }

  function showApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    applyRoleVisibility();
    navigate(currentRoute() || 'dashboard');
  }

  function currentRoute() {
    return (location.hash || '').replace('#', '') || null;
  }

  function setActiveNav(route) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === route);
    });
  }

  function navigate(route) {
    if (!routes[route]) route = 'dashboard';
    location.hash = route;
    setActiveNav(route);
    closeSidebar();
    const root = document.getElementById('view-root');
    root.innerHTML = '<div class="empty-state">Loading&hellip;</div>';
    Promise.resolve(routes[route]()).catch((err) => {
      root.innerHTML = `<div class="empty-state"><div class="icon">&#9888;</div>${escapeHtml(err.message)}</div>`;
    });
  }

  function toast(message, type = '') {
    const host = document.getElementById('toast-host');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function openModal(innerHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    if (!d) return '&mdash;';
    const dt = new Date(d + (d.length <= 10 ? 'T00:00:00' : ''));
    if (isNaN(dt)) return escapeHtml(d);
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtMoney(n) {
    const num = Number(n || 0);
    return 'Rs. ' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Formats a phone number for display as "+91 9900502056" (Indian numbering). Leaves anything that doesn't look like an Indian number unchanged. */
  function fmtPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/[^\d]/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return '+91 ' + digits.slice(2);
    if (digits.length === 10) return '+91 ' + digits;
    return phone;
  }

  /** Digits-only phone number (keeps country code, strips +, spaces, dashes). */
  function digitsOnly(phone) {
    return String(phone || '').replace(/[^\d]/g, '');
  }

  /** tel: link for click-to-call via the device's own phone/softphone app. */
  function telLink(phone) {
    return `tel:+${digitsOnly(phone)}`;
  }

  /** wa.me click-to-chat link — opens WhatsApp (app or web) with a pre-filled message. */
  function waLink(phone, message) {
    const base = `https://wa.me/${digitsOnly(phone)}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
  }

  function openChangePasswordModal() {
    openModal(`
      <h2>Change password</h2>
      <form id="change-password-form">
        <div class="form-row"><label>Current password</label><input type="password" name="current_password" required /></div>
        <div class="form-row"><label>New password</label><input type="password" name="new_password" minlength="6" required /></div>
        <div class="form-row"><label>Confirm new password</label><input type="password" name="confirm_password" minlength="6" required /></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Update password</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (fd.new_password !== fd.confirm_password) {
        toast('New password and confirmation do not match.', 'error');
        return;
      }
      try {
        await Api.put('/api/auth/me/password', fd);
        toast('Password updated.', 'success');
        closeModal();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
  }

  function initShellEvents() {
    document.getElementById('nav-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (btn) navigate(btn.dataset.route);
    });
    document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
    document.getElementById('logout-btn').addEventListener('click', () => {
      Api.clearToken();
      showLogin();
    });
    document.getElementById('change-password-btn').addEventListener('click', openChangePasswordModal);
    window.addEventListener('hashchange', () => {
      const route = currentRoute();
      if (route) { setActiveNav(route); Promise.resolve(routes[route] ? routes[route]() : routes.dashboard()); }
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        const data = await Api.post('/api/auth/login', { username, password });
        Api.setToken(data.token);
        Api.setUser(data.user);
        showApp();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  return { navigate, toast, openModal, closeModal, escapeHtml, fmtDate, fmtMoney, fmtPhone, telLink, waLink, currentUser, showLogin, showApp, initShellEvents };
})();

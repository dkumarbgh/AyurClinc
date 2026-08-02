window.Views = window.Views || {};

Views.Settings = (() => {
  async function render() {
    const root = document.getElementById('view-root');
    const settings = await Api.get('/api/settings');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Administration</div><h1>Clinic settings</h1></div>
      </div>
      <p class="helper-text" style="margin-bottom:16px; max-width:560px;">This information appears as the letterhead on generated documents &mdash; invoices, receipts, certificates, and insurance bills.</p>
      <div class="card" style="max-width:560px;">
        <form id="settings-form">
          <div class="form-row"><label>Clinic name *</label><input name="clinic_name" required value="${App.escapeHtml(settings.clinic_name)}" /></div>
          <div class="form-row"><label>Address</label><textarea name="address" rows="2">${App.escapeHtml(settings.address)}</textarea></div>
          <div class="form-grid">
            <div class="form-row"><label>Phone</label><input name="phone" value="${App.escapeHtml(settings.phone)}" /></div>
            <div class="form-row"><label>Email</label><input type="email" name="email" value="${App.escapeHtml(settings.email)}" /></div>
          </div>
          <div class="form-row"><label>Registration number</label><input name="registration_number" placeholder="Clinic license / GST / registration number" value="${App.escapeHtml(settings.registration_number)}" /></div>
          <button type="submit" class="btn">Save settings</button>
        </form>
      </div>
    `;
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.put('/api/settings', fd);
        App.toast('Settings saved.', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

window.Views = window.Views || {};

Views.Whatsapp = (() => {
  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Notifications</div><h1>WhatsApp log</h1></div>
        <div>
          <button class="btn secondary" id="btn-run-reminders">Run reminder jobs now</button>
          <button class="btn" id="btn-test-send">Send test message</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:18px; background: var(--teal-100); border-color: var(--teal-100);">
        <p style="margin:0; font-size:13px; color: var(--teal-900);">
          No WhatsApp provider is connected yet, so messages are logged here instead of actually being sent.
          Add Twilio or Meta Cloud API credentials to the server's <code>.env</code> file (see the README) to start sending for real &mdash; nothing else in the app needs to change.
        </p>
      </div>
      <div class="card"><div id="wa-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    document.getElementById('btn-test-send').addEventListener('click', openTestSendModal);
    document.getElementById('btn-run-reminders').addEventListener('click', async () => {
      try {
        const result = await Api.post('/api/whatsapp/run-reminders');
        App.toast(`Sent: ${result.vaccineCount} vaccine, ${result.appointmentCount} appointment, ${result.feeCount} fee reminder(s).`, 'success');
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
    await loadTable();
  }

  async function loadTable() {
    const result = await Api.get('/api/whatsapp/logs?limit=50');
    const el = document.getElementById('wa-table');
    if (!result.data.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#9993;</div>No messages sent yet.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>When</th><th>Patient</th><th>Phone</th><th>Type</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>
          ${result.data.map((m) => `
            <tr>
              <td style="white-space:nowrap;">${App.fmtDate(m.created_at.slice(0, 10))}</td>
              <td>${App.escapeHtml(m.patient_name || '&mdash;')}</td>
              <td>${App.escapeHtml(App.fmtPhone(m.phone))}</td>
              <td><span class="badge gray">${m.message_type.replace('_', ' ')}</span></td>
              <td style="max-width:320px; white-space:normal;">${App.escapeHtml(m.message)}</td>
              <td><span class="badge ${m.status === 'sent' ? 'sage' : m.status === 'failed' ? 'coral' : 'ochre'}">${m.status}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function openTestSendModal() {
    App.openModal(`
      <h2>Send a test WhatsApp message</h2>
      <form id="test-send-form">
        <div class="form-row"><label>Phone number *</label><input name="to" placeholder="+91XXXXXXXXXX" required /></div>
        <div class="form-row"><label>Message *</label><textarea name="message" rows="3" required>Hello from the clinic! This is a test message.</textarea></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Send</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('test-send-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        const result = await Api.post('/api/whatsapp/test-send', fd);
        App.toast(`Message ${result.status} (provider: ${result.provider}).`, result.status === 'failed' ? 'error' : 'success');
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

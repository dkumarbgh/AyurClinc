window.Views = window.Views || {};

Views.SwarnaPrashana = (() => {
  let state = { tab: 'calls', callFilter: '', month: new Date().toISOString().slice(0, 7) };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Swarna Prashana</div><h1>Monthly dose &amp; parent calls</h1></div>
        <button class="btn" id="btn-enroll">+ Enroll patient</button>
      </div>
      <div class="tab-row">
        <button class="tab-btn ${state.tab === 'calls' ? 'active' : ''}" data-tab="calls">Calling queue</button>
        <button class="tab-btn ${state.tab === 'monthly' ? 'active' : ''}" data-tab="monthly">Monthly report</button>
        <button class="tab-btn ${state.tab === 'enrollments' ? 'active' : ''}" data-tab="enrollments">Enrollments</button>
      </div>
      <div id="sp-content"></div>
    `;
    root.querySelectorAll('.tab-row .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
    });
    document.getElementById('btn-enroll').addEventListener('click', openEnrollModal);

    if (state.tab === 'calls') await renderCallQueue();
    else if (state.tab === 'monthly') await renderMonthlyReport();
    else await renderEnrollments();
  }

  // ---------------- Calling queue ----------------

  async function renderCallQueue() {
    const contentEl = document.getElementById('sp-content');
    contentEl.innerHTML = `
      <div class="tab-row">
        ${['', 'not_called', 'called', 'no_answer', 'rejected'].map((s) => `
          <button class="tab-btn ${state.callFilter === s ? 'active' : ''}" data-filter="${s}">${filterLabel(s)}</button>
        `).join('')}
      </div>
      <div class="card"><div id="calls-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    contentEl.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { state.callFilter = btn.dataset.filter; renderCallQueue(); });
    });
    await loadCallQueue();
  }

  function filterLabel(s) {
    return { '': 'All due (31 days)', not_called: 'Not called', called: 'Called', no_answer: 'No answer', rejected: 'Rejected' }[s];
  }

  async function loadCallQueue() {
    const params = new URLSearchParams({ days: 31 });
    if (state.callFilter) params.set('call_status', state.callFilter);
    const rows = await Api.get(`/api/swarna-prashana/doses?${params.toString()}`);
    const el = document.getElementById('calls-table');
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#9742;</div>No doses in this list right now.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Patient</th><th>Contact</th><th>Dose</th><th>Scheduled</th><th>Call status</th><th>Dose status</th><th>Connect</th><th>Update</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const contactNumber = r.guardian_phone || r.whatsapp_number || r.phone;
            const contactDisplay = App.fmtPhone(contactNumber);
            const waMsg = `Hi, this is a reminder from the clinic about ${r.full_name}'s Swarna Prashana dose scheduled for ${r.scheduled_date}. Could you confirm if you'll be able to bring them in?`;
            return `
            <tr>
              <td>${App.escapeHtml(r.full_name)} <span class="helper-text">${App.escapeHtml(r.patient_code)}</span>${r.guardian_name ? `<br/><span class="helper-text">Guardian: ${App.escapeHtml(r.guardian_name)}</span>` : ''}</td>
              <td>${App.escapeHtml(contactDisplay)}</td>
              <td>#${r.dose_number}</td>
              <td>${App.fmtDate(r.scheduled_date)}</td>
              <td>${callBadge(r.call_status)}</td>
              <td>${doseBadge(r.dose_status)}</td>
              <td>
                <a class="icon-btn call" href="${App.telLink(contactNumber)}" title="Call ${App.escapeHtml(contactDisplay)}">&#9742;</a>
                <a class="icon-btn whatsapp" target="_blank" rel="noopener" href="${App.waLink(contactNumber, waMsg)}" title="WhatsApp ${App.escapeHtml(contactDisplay)}">&#9993;</a>
              </td>
              <td style="white-space:nowrap;">
                <button class="btn secondary small log-call-btn" data-id="${r.id}" data-name="${App.escapeHtml(r.full_name)}">Log call</button>
                ${r.dose_status === 'pending' ? `<button class="btn small administer-btn" data-id="${r.id}" data-name="${App.escapeHtml(r.full_name)}">Given</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.log-call-btn').forEach((btn) => {
      btn.addEventListener('click', () => openLogCallModal(btn.dataset.id, btn.dataset.name));
    });
    el.querySelectorAll('.administer-btn').forEach((btn) => {
      btn.addEventListener('click', () => openAdministerModal(btn.dataset.id, btn.dataset.name));
    });
  }

  function callBadge(status) {
    const map = { not_called: 'gray', called: 'teal', no_answer: 'ochre', rejected: 'coral' };
    return `<span class="badge ${map[status] || 'gray'}">${status.replace('_', ' ')}</span>`;
  }
  function doseBadge(status) {
    const map = { pending: 'ochre', administered: 'sage', missed: 'coral', cancelled: 'gray' };
    return `<span class="badge ${map[status] || 'gray'}">${status}</span>`;
  }

  function openLogCallModal(id, name, onSaved) {
    onSaved = onSaved || loadCallQueue;
    App.openModal(`
      <h2>Log call outcome</h2>
      <p class="helper-text">${name}</p>
      <form id="call-form">
        <div class="form-row">
          <label>Outcome *</label>
          <select name="call_status" required>
            <option value="called">Called &mdash; spoke with parent</option>
            <option value="no_answer">No answer</option>
            <option value="rejected">Rejected &mdash; parent declined</option>
          </select>
        </div>
        <div class="form-row"><label>Called by</label><input name="called_by" placeholder="e.g. Nurse Anita" /></div>
        <div class="form-row"><label>Notes</label><textarea name="call_notes" rows="2" placeholder="Anything worth remembering for next time"></textarea></div>
        <p class="helper-text">If you select "No answer," we'll automatically send a WhatsApp follow-up message.</p>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('call-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.put(`/api/swarna-prashana/doses/${id}/call`, fd);
        App.toast('Call outcome logged.', 'success');
        App.closeModal();
        await onSaved();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  function openAdministerModal(id, name, onSaved) {
    onSaved = onSaved || loadCallQueue;
    const today = new Date().toISOString().slice(0, 10);
    App.openModal(`
      <h2>Mark dose given</h2>
      <p class="helper-text">${name}</p>
      <form id="administer-form">
        <div class="form-row"><label>Date given</label><input type="date" name="administered_date" value="${today}" required /></div>
        <div class="form-row"><label>Given by</label><input name="administered_by" placeholder="e.g. Dr. Kiran" /></div>
        <div class="form-row"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <p class="helper-text">Next month's dose will be scheduled automatically.</p>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Confirm</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('administer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        const result = await Api.put(`/api/swarna-prashana/doses/${id}/administer`, fd);
        App.toast(result.nextDose ? `Recorded. Next dose scheduled for ${App.fmtDate(result.nextDose.scheduled_date)}.` : 'Recorded.', 'success');
        App.closeModal();
        await onSaved();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  // ---------------- Monthly report ----------------

  async function renderMonthlyReport() {
    const contentEl = document.getElementById('sp-content');
    contentEl.innerHTML = `
      <div class="toolbar">
        <div class="form-row" style="margin:0; max-width:200px;">
          <input type="month" id="month-picker" value="${state.month}" />
        </div>
      </div>
      <div id="monthly-summary"></div>
      <div class="card" style="margin-top:16px;"><div id="monthly-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    document.getElementById('month-picker').addEventListener('change', (e) => {
      state.month = e.target.value;
      loadMonthlyReport();
    });
    await loadMonthlyReport();
  }

  async function loadMonthlyReport() {
    const result = await Api.get(`/api/swarna-prashana/doses/monthly?month=${state.month}`);
    const monthLabel = new Date(state.month + '-02').toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

    document.getElementById('monthly-summary').innerHTML = `
      <div class="grid grid-4">
        <div class="card stat-card"><div class="label">Doses due &mdash; ${monthLabel}</div><div class="value">${result.summary.total}</div></div>
        <div class="card stat-card good"><div class="label">Given</div><div class="value">${result.summary.doseStatus.administered}</div></div>
        <div class="card stat-card ${result.summary.callStatus.not_called ? 'alert' : ''}"><div class="label">Not yet called</div><div class="value">${result.summary.callStatus.not_called}</div></div>
        <div class="card stat-card"><div class="label">Rejected</div><div class="value">${result.summary.callStatus.rejected}</div></div>
      </div>
    `;

    const el = document.getElementById('monthly-table');
    if (!result.doses.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#9742;</div>No doses scheduled in ${monthLabel}.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Patient</th><th>Contact</th><th>Dose</th><th>Scheduled</th><th>Call status</th><th>Dose status</th><th>Connect</th><th>Update</th></tr></thead>
        <tbody>
          ${result.doses.map((r) => {
            const contactNumber = r.guardian_phone || r.whatsapp_number || r.phone;
            const contactDisplay = App.fmtPhone(contactNumber);
            const waMsg = `Hi, this is a reminder from the clinic about ${r.full_name}'s Swarna Prashana dose scheduled for ${r.scheduled_date}. Could you confirm if you'll be able to bring them in?`;
            return `
            <tr>
              <td>${App.escapeHtml(r.full_name)} <span class="helper-text">${App.escapeHtml(r.patient_code)}</span></td>
              <td>${App.escapeHtml(contactDisplay)}</td>
              <td>#${r.dose_number}</td>
              <td>${App.fmtDate(r.scheduled_date)}</td>
              <td>${callBadge(r.call_status)}</td>
              <td>${doseBadge(r.dose_status)}</td>
              <td>
                <a class="icon-btn call" href="${App.telLink(contactNumber)}" title="Call ${App.escapeHtml(contactDisplay)}">&#9742;</a>
                <a class="icon-btn whatsapp" target="_blank" rel="noopener" href="${App.waLink(contactNumber, waMsg)}" title="WhatsApp ${App.escapeHtml(contactDisplay)}">&#9993;</a>
              </td>
              <td style="white-space:nowrap;">
                <button class="btn secondary small log-call-btn" data-id="${r.id}" data-name="${App.escapeHtml(r.full_name)}">Log call</button>
                ${r.dose_status === 'pending' ? `<button class="btn small administer-btn" data-id="${r.id}" data-name="${App.escapeHtml(r.full_name)}">Given</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.log-call-btn').forEach((btn) => {
      btn.addEventListener('click', () => openLogCallModal(btn.dataset.id, btn.dataset.name, loadMonthlyReport));
    });
    el.querySelectorAll('.administer-btn').forEach((btn) => {
      btn.addEventListener('click', () => openAdministerModal(btn.dataset.id, btn.dataset.name, loadMonthlyReport));
    });
  }

  // ---------------- Enrollments ----------------

  async function renderEnrollments() {
    const contentEl = document.getElementById('sp-content');
    contentEl.innerHTML = `<div class="card"><div id="enroll-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>`;
    const rows = await Api.get('/api/swarna-prashana/enrollments');
    const el = document.getElementById('enroll-table');
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#9742;</div>No patients enrolled yet.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Patient</th><th>Start date</th><th>Doses given</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((e) => `
            <tr>
              <td>${App.escapeHtml(e.full_name)} <span class="helper-text">${App.escapeHtml(e.patient_code)}</span></td>
              <td>${App.fmtDate(e.start_date)}</td>
              <td>${e.doses_completed || 0}</td>
              <td><span class="badge ${e.status === 'active' ? 'sage' : e.status === 'paused' ? 'ochre' : 'gray'}">${e.status}</span></td>
              <td>
                ${e.status === 'active' ? `<button class="btn secondary small pause-btn" data-id="${e.id}">Pause</button><button class="btn danger small stop-btn" data-id="${e.id}">Stop</button>` : ''}
                ${e.status === 'paused' ? `<button class="btn secondary small resume-btn" data-id="${e.id}">Resume</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.pause-btn').forEach((btn) => btn.addEventListener('click', () => updateEnrollment(btn.dataset.id, 'paused')));
    el.querySelectorAll('.stop-btn').forEach((btn) => btn.addEventListener('click', () => {
      if (confirm('Stop this enrollment? No further monthly doses will be scheduled.')) updateEnrollment(btn.dataset.id, 'stopped');
    }));
    el.querySelectorAll('.resume-btn').forEach((btn) => btn.addEventListener('click', () => updateEnrollment(btn.dataset.id, 'active')));
  }

  async function updateEnrollment(id, status) {
    try {
      await Api.put(`/api/swarna-prashana/enrollments/${id}`, { status });
      App.toast('Enrollment updated.', 'success');
      await renderEnrollments();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function openEnrollModal() {
    const today = new Date().toISOString().slice(0, 10);
    App.openModal(`
      <h2>Enroll a patient in Swarna Prashana</h2>
      <form id="enroll-form">
        <div class="form-row">
          <label>Patient *</label>
          <input id="patient-search-input" placeholder="Type to search by name or phone&hellip;" autocomplete="off" required />
          <input type="hidden" name="patient_id" id="selected-patient-id" />
          <div id="patient-search-results" style="max-height:140px; overflow-y:auto;"></div>
        </div>
        <div class="form-row"><label>First dose date *</label><input type="date" name="start_date" value="${today}" required /></div>
        <div class="form-row"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Enroll</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);

    const searchInput = document.getElementById('patient-search-input');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const q = searchInput.value.trim();
        if (!q) { document.getElementById('patient-search-results').innerHTML = ''; return; }
        const result = await Api.get(`/api/patients?search=${encodeURIComponent(q)}&limit=6`);
        document.getElementById('patient-search-results').innerHTML = result.data.map((p) => `
          <div class="patient-pick" data-id="${p.id}" data-name="${App.escapeHtml(p.full_name)}" style="padding:7px 4px; cursor:pointer; border-bottom:1px solid var(--line); font-size:13px;">
            ${App.escapeHtml(p.full_name)} <span class="helper-text">${App.escapeHtml(p.patient_code)} &middot; ${App.escapeHtml(App.fmtPhone(p.phone))}</span>
          </div>`).join('') || `<div class="helper-text">No matches.</div>`;
        document.querySelectorAll('.patient-pick').forEach((row) => {
          row.addEventListener('click', () => {
            document.getElementById('selected-patient-id').value = row.dataset.id;
            searchInput.value = row.dataset.name;
            document.getElementById('patient-search-results').innerHTML = '';
          });
        });
      }, 250);
    });

    document.getElementById('enroll-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (!fd.patient_id) { App.toast('Please select a patient from the search results.', 'error'); return; }
      try {
        await Api.post('/api/swarna-prashana/enrollments', fd);
        App.toast('Patient enrolled.', 'success');
        App.closeModal();
        state.tab = 'enrollments';
        await render();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

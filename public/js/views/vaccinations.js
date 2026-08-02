window.Views = window.Views || {};

Views.Vaccinations = (() => {
  let state = { tab: 'due' };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Vaccinations</div><h1>Vaccination schedule</h1></div>
        <div>
          <button class="btn secondary" id="btn-manage-vaccines">Manage vaccine list</button>
          <button class="btn" id="btn-schedule-dose">+ Schedule dose</button>
        </div>
      </div>
      <div class="tab-row">
        <button class="tab-btn ${state.tab === 'due' ? 'active' : ''}" data-tab="due">Due within 7 days</button>
        <button class="tab-btn ${state.tab === 'overdue' ? 'active' : ''}" data-tab="overdue">Overdue</button>
      </div>
      <div class="card"><div id="vax-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
    });
    document.getElementById('btn-manage-vaccines').addEventListener('click', openVaccineListModal);
    document.getElementById('btn-schedule-dose').addEventListener('click', openScheduleModal);
    await loadTable();
  }

  async function loadTable() {
    const endpoint = state.tab === 'due' ? '/api/vaccines/due/upcoming?days=7' : '/api/vaccines/due/overdue';
    const rows = await Api.get(endpoint);
    const el = document.getElementById('vax-table');
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#10003;</div>Nothing ${state.tab === 'due' ? 'due soon' : 'overdue'}. All caught up.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Patient</th><th>Phone</th><th>Vaccine</th><th>Dose</th><th>Scheduled</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${App.escapeHtml(r.full_name)}</td>
              <td>${App.escapeHtml(r.phone)}</td>
              <td>${App.escapeHtml(r.vaccine_name)}</td>
              <td>${r.dose_number}</td>
              <td><span class="badge ${state.tab === 'due' ? 'ochre' : 'coral'}">${App.fmtDate(r.scheduled_date)}</span></td>
              <td><button class="btn small administer-btn" data-id="${r.id}" data-name="${App.escapeHtml(r.full_name)}" data-vaccine="${App.escapeHtml(r.vaccine_name)}">Mark administered</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.administer-btn').forEach((btn) => {
      btn.addEventListener('click', () => openAdministerModal(btn.dataset.id, btn.dataset.name, btn.dataset.vaccine));
    });
  }

  function openAdministerModal(id, name, vaccine) {
    const today = new Date().toISOString().slice(0, 10);
    App.openModal(`
      <h2>Mark dose administered</h2>
      <p class="helper-text">${name} &mdash; ${vaccine}</p>
      <form id="administer-form">
        <div class="form-row"><label>Administered date</label><input type="date" name="administered_date" value="${today}" required /></div>
        <div class="form-row"><label>Administered by</label><input name="administered_by" placeholder="e.g. Nurse Anita" /></div>
        <div class="form-row"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <p class="helper-text">If this vaccine recurs on a schedule (e.g. monthly), the next dose will be scheduled automatically.</p>
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
        const result = await Api.put(`/api/vaccines/record/${id}/administer`, fd);
        App.toast(result.nextDose ? `Recorded. Next dose auto-scheduled for ${App.fmtDate(result.nextDose.scheduled_date)}.` : 'Recorded.', 'success');
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  async function openScheduleModal() {
    const vaccines = await Api.get('/api/vaccines');
    App.openModal(`
      <h2>Schedule a vaccine dose</h2>
      <form id="schedule-form">
        <div class="form-row">
          <label>Patient *</label>
          <input id="patient-search-input" placeholder="Type to search by name or phone&hellip;" autocomplete="off" required />
          <input type="hidden" name="patient_id" id="selected-patient-id" />
          <div id="patient-search-results" style="max-height:140px; overflow-y:auto;"></div>
        </div>
        <div class="form-row">
          <label>Vaccine *</label>
          <select name="vaccine_id" required>
            <option value="">Select a vaccine&hellip;</option>
            ${vaccines.filter((v) => v.active).map((v) => `<option value="${v.id}">${App.escapeHtml(v.name)}${v.recurring_interval_months ? ' (every ' + v.recurring_interval_months + ' mo)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Scheduled date *</label><input type="date" name="scheduled_date" required /></div>
          <div class="form-row"><label>Dose number</label><input type="number" name="dose_number" min="1" value="1" /></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Schedule</button>
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
            ${App.escapeHtml(p.full_name)} <span class="helper-text">${App.escapeHtml(p.patient_code)} &middot; ${App.escapeHtml(p.phone)}</span>
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

    document.getElementById('schedule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (!fd.patient_id) { App.toast('Please select a patient from the search results.', 'error'); return; }
      try {
        await Api.post('/api/vaccines/schedule', fd);
        App.toast('Vaccine dose scheduled.', 'success');
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  async function openVaccineListModal() {
    const vaccines = await Api.get('/api/vaccines');
    App.openModal(`
      <h2>Vaccine master list</h2>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table>
          <thead><tr><th>Name</th><th>Recurs</th><th>Total doses</th><th>Active</th></tr></thead>
          <tbody>
            ${vaccines.map((v) => `
              <tr>
                <td>${App.escapeHtml(v.name)}</td>
                <td>${v.recurring_interval_months ? 'Every ' + v.recurring_interval_months + ' mo' : '&mdash;'}</td>
                <td>${v.total_doses || '&mdash;'}</td>
                <td><span class="badge ${v.active ? 'sage' : 'gray'}">${v.active ? 'Active' : 'Inactive'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <h2 style="font-size:16px;">Add a new vaccine type</h2>
      <form id="new-vaccine-form">
        <div class="form-row"><label>Name *</label><input name="name" required /></div>
        <div class="form-row"><label>Description</label><input name="description" /></div>
        <div class="form-grid">
          <div class="form-row"><label>Recurs every N months</label><input type="number" name="recurring_interval_months" placeholder="e.g. 1 for monthly" min="1" /></div>
          <div class="form-row"><label>Total doses (if a fixed series)</label><input type="number" name="total_doses" min="1" /></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Close</button>
          <button type="submit" class="btn">Add vaccine</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('new-vaccine-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.post('/api/vaccines', fd);
        App.toast('Vaccine added.', 'success');
        App.closeModal();
        openVaccineListModal();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

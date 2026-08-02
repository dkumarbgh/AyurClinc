window.Views = window.Views || {};

Views.Rooms = (() => {
  let state = { date: new Date().toISOString().slice(0, 10) };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Scheduling</div><h1>Rooms &amp; appointments</h1></div>
        <button class="btn" id="btn-book">+ Book appointment</button>
      </div>
      <div class="toolbar">
        <div class="form-row" style="margin:0; max-width:200px;">
          <input type="date" id="date-picker" value="${state.date}" />
        </div>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div id="room-pods-detail" class="room-pods"><div class="empty-state">Loading&hellip;</div></div>
      </div>
      <div class="card">
        <h3 class="section-title">Appointments on ${App.fmtDate(state.date)}</h3>
        <div id="appointments-table" class="table-wrap"></div>
      </div>
    `;
    document.getElementById('date-picker').addEventListener('change', (e) => { state.date = e.target.value; loadAll(); });
    document.getElementById('btn-book').addEventListener('click', () => openBookingModal());
    await loadAll();
  }

  async function loadAll() {
    document.querySelector('.section-title').textContent = `Appointments on ${new Date(state.date).toDateString()}`;
    const occ = await Api.get(`/api/rooms/occupancy?date=${state.date}`);
    const podsEl = document.getElementById('room-pods-detail');
    podsEl.innerHTML = occ.rooms.map((room) => `
      <div class="room-pod ${room.sessions.length ? 'busy' : ''}">
        <div>
          <div class="room-title">${App.escapeHtml(room.room_name)}</div>
          <div class="room-status">
            ${room.sessions.length ? room.sessions.map((s) => `
              <div style="margin-bottom:4px;">${s.start_time}&ndash;${s.end_time} &middot; ${App.escapeHtml(s.patient_name)}<br/><span class="helper-text">${App.escapeHtml(s.therapist_name)}</span></div>
            `).join('') : 'Free all day'}
          </div>
        </div>
        <div class="room-count">${room.sessions.length} booking${room.sessions.length === 1 ? '' : 's'}</div>
      </div>
    `).join('');

    const appts = await Api.get(`/api/appointments?date=${state.date}`);
    const tableEl = document.getElementById('appointments-table');
    if (!appts.length) {
      tableEl.innerHTML = `<div class="empty-state">No appointments booked for this date yet.</div>`;
      return;
    }
    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Time</th><th>Patient</th><th>Room</th><th>Therapist</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${appts.map((a) => `
            <tr>
              <td>${a.start_time}&ndash;${a.end_time}</td>
              <td>${App.escapeHtml(a.patient_name)}</td>
              <td>${App.escapeHtml(a.room_name)}</td>
              <td>${App.escapeHtml(a.therapist_name)}</td>
              <td><span class="badge ${a.status === 'scheduled' ? 'teal' : a.status === 'completed' ? 'sage' : 'coral'}">${a.status.replace('_', ' ')}</span></td>
              <td>
                ${a.status === 'scheduled' ? `
                  <button class="btn secondary small complete-btn" data-id="${a.id}">Complete</button>
                  <button class="btn danger small cancel-btn" data-id="${a.id}">Cancel</button>
                ` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    tableEl.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await Api.del(`/api/appointments/${btn.dataset.id}`); App.toast('Appointment cancelled.', 'success'); await loadAll(); }
        catch (err) { App.toast(err.message, 'error'); }
      });
    });
    tableEl.querySelectorAll('.complete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await Api.put(`/api/appointments/${btn.dataset.id}`, { status: 'completed' }); App.toast('Marked completed.', 'success'); await loadAll(); }
        catch (err) { App.toast(err.message, 'error'); }
      });
    });
  }

  async function openBookingModal() {
    const [rooms, therapists] = await Promise.all([
      Api.get('/api/rooms'),
      Api.get('/api/therapists?active=true'),
    ]);
    App.openModal(`
      <h2>Book a therapy appointment</h2>
      <form id="booking-form">
        <div class="form-row">
          <label>Patient *</label>
          <input id="patient-search-input" placeholder="Type to search by name or phone&hellip;" autocomplete="off" required />
          <input type="hidden" name="patient_id" id="selected-patient-id" />
          <div id="patient-search-results" style="max-height:140px; overflow-y:auto;"></div>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label>Room *</label>
            <select name="room_id" required>${rooms.filter((r) => r.active).map((r) => `<option value="${r.id}">${App.escapeHtml(r.room_name)}</option>`).join('')}</select>
          </div>
          <div class="form-row">
            <label>Therapist *</label>
            <select name="therapist_id" required>${therapists.map((t) => `<option value="${t.id}">${App.escapeHtml(t.full_name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Date *</label><input type="date" name="session_date" value="${state.date}" required /></div>
          <div class="form-row"><label>Start time *</label><input type="time" name="start_time" required /></div>
        </div>
        <div class="form-row"><label>End time *</label><input type="time" name="end_time" required /></div>
        <div class="form-row"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Book appointment</button>
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

    document.getElementById('booking-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (!fd.patient_id) { App.toast('Please select a patient from the search results.', 'error'); return; }
      try {
        await Api.post('/api/appointments', fd);
        App.toast('Appointment booked.', 'success');
        App.closeModal();
        await loadAll();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

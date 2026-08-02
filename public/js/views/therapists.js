window.Views = window.Views || {};

Views.Therapists = (() => {
  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Staff</div><h1>Therapists</h1></div>
        <button class="btn" id="btn-add-therapist">+ Add therapist</button>
      </div>
      <div class="card"><div id="therapists-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    document.getElementById('btn-add-therapist').addEventListener('click', () => openForm());
    await loadTable();
  }

  async function loadTable() {
    const rows = await Api.get('/api/therapists');
    const el = document.getElementById('therapists-table');
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#9781;</div>No therapists added yet.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Specialization</th><th>Phone</th><th>Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((t) => `
            <tr>
              <td>${App.escapeHtml(t.full_name)}</td>
              <td>${App.escapeHtml(t.specialization || '&mdash;')}</td>
              <td>${App.escapeHtml(t.phone || '&mdash;')}</td>
              <td>${App.escapeHtml(t.email || '&mdash;')}</td>
              <td><span class="badge ${t.active ? 'sage' : 'gray'}">${t.active ? 'Active' : 'Inactive'}</span></td>
              <td>
                <button class="btn secondary small edit-btn" data-id="${t.id}">Edit</button>
                ${t.active ? `<button class="btn danger small deactivate-btn" data-id="${t.id}">Deactivate</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = await Api.get(`/api/therapists/${btn.dataset.id}`);
        openForm(t);
      });
    });
    el.querySelectorAll('.deactivate-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deactivate this therapist? They will no longer appear in booking lists.')) return;
        try { await Api.del(`/api/therapists/${btn.dataset.id}`); App.toast('Therapist deactivated.', 'success'); await loadTable(); }
        catch (err) { App.toast(err.message, 'error'); }
      });
    });
  }

  function openForm(therapist) {
    const isEdit = !!therapist;
    App.openModal(`
      <h2>${isEdit ? 'Edit therapist' : 'Add therapist'}</h2>
      <form id="therapist-form">
        <div class="form-row"><label>Full name *</label><input name="full_name" required value="${App.escapeHtml(therapist?.full_name)}" /></div>
        <div class="form-grid">
          <div class="form-row"><label>Specialization</label><input name="specialization" value="${App.escapeHtml(therapist?.specialization)}" /></div>
          <div class="form-row"><label>Phone</label><input name="phone" value="${App.escapeHtml(therapist?.phone)}" /></div>
        </div>
        <div class="form-row"><label>Email</label><input type="email" name="email" value="${App.escapeHtml(therapist?.email)}" /></div>
        ${isEdit ? `<div class="form-row"><label>Status</label><select name="active"><option value="true" ${therapist.active ? 'selected' : ''}>Active</option><option value="false" ${!therapist.active ? 'selected' : ''}>Inactive</option></select></div>` : ''}
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">${isEdit ? 'Save changes' : 'Add therapist'}</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('therapist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if ('active' in fd) fd.active = fd.active === 'true';
      try {
        if (isEdit) { await Api.put(`/api/therapists/${therapist.id}`, fd); App.toast('Therapist updated.', 'success'); }
        else { await Api.post('/api/therapists', fd); App.toast('Therapist added.', 'success'); }
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

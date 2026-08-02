window.Views = window.Views || {};

Views.Users = (() => {
  const ROLE_LABELS = { admin: 'Admin', front_desk: 'Front desk', therapist: 'Therapist' };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Administration</div><h1>Staff accounts</h1></div>
        <button class="btn" id="btn-add-user">+ Add staff account</button>
      </div>
      <div class="card"><div id="users-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    document.getElementById('btn-add-user').addEventListener('click', () => openUserForm());
    await loadTable();
  }

  async function loadTable() {
    const rows = await Api.get('/api/users');
    const el = document.getElementById('users-table');
    const myId = App.currentUser() ? App.currentUser().id : null;

    el.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
          ${rows.map((u) => `
            <tr>
              <td>${App.escapeHtml(u.full_name)}${u.id === myId ? ' <span class="helper-text">(you)</span>' : ''}</td>
              <td>${App.escapeHtml(u.username)}</td>
              <td><span class="badge teal">${ROLE_LABELS[u.role] || u.role}</span></td>
              <td><span class="badge ${u.active ? 'sage' : 'gray'}">${u.active ? 'Active' : 'Inactive'}</span></td>
              <td>${App.fmtDate(u.created_at.slice(0, 10))}</td>
              <td style="white-space:nowrap;">
                <button class="btn secondary small edit-btn" data-id="${u.id}">Edit</button>
                <button class="btn secondary small reset-btn" data-id="${u.id}" data-name="${App.escapeHtml(u.full_name)}">Reset password</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('.edit-btn').forEach((btn) => {
      const user = rows.find((r) => String(r.id) === btn.dataset.id);
      btn.addEventListener('click', () => openUserForm(user, myId));
    });
    el.querySelectorAll('.reset-btn').forEach((btn) => {
      btn.addEventListener('click', () => openResetPasswordModal(btn.dataset.id, btn.dataset.name));
    });
  }

  function openUserForm(user, myId) {
    const isEdit = !!user;
    const isSelf = isEdit && user.id === myId;
    App.openModal(`
      <h2>${isEdit ? 'Edit staff account' : 'Add staff account'}</h2>
      ${isSelf ? `<p class="helper-text">You can't change your own role or deactivate your own account here &mdash; use "Change password" in the sidebar instead.</p>` : ''}
      <form id="user-form">
        <div class="form-row"><label>Full name *</label><input name="full_name" required value="${App.escapeHtml(user?.full_name)}" /></div>
        ${!isEdit ? `
          <div class="form-row"><label>Username *</label><input name="username" required /></div>
          <div class="form-row"><label>Password *</label><input type="password" name="password" minlength="6" required /></div>
        ` : ''}
        <div class="form-row">
          <label>Role *</label>
          <select name="role" required ${isSelf ? 'disabled' : ''}>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin &mdash; full access</option>
            <option value="front_desk" ${user?.role === 'front_desk' ? 'selected' : ''}>Front desk &mdash; patients, fees, scheduling</option>
            <option value="therapist" ${user?.role === 'therapist' ? 'selected' : ''}>Therapist &mdash; clinical work only, no fees</option>
          </select>
        </div>
        ${isEdit ? `
          <div class="form-row">
            <label>Status</label>
            <select name="active" ${isSelf ? 'disabled' : ''}>
              <option value="true" ${user.active ? 'selected' : ''}>Active</option>
              <option value="false" ${!user.active ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        ` : ''}
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">${isEdit ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if ('active' in fd) fd.active = fd.active === 'true';
      try {
        if (isEdit) {
          await Api.put(`/api/users/${user.id}`, fd);
          App.toast('Account updated.', 'success');
        } else {
          await Api.post('/api/users', fd);
          App.toast('Staff account created.', 'success');
        }
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  function openResetPasswordModal(id, name) {
    App.openModal(`
      <h2>Reset password</h2>
      <p class="helper-text">${name}</p>
      <form id="reset-form">
        <div class="form-row"><label>New password *</label><input type="password" name="new_password" minlength="6" required /></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Set new password</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.put(`/api/users/${id}/reset-password`, fd);
        App.toast('Password reset.', 'success');
        App.closeModal();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

window.Views = window.Views || {};

Views.AuditLog = (() => {
  let state = { page: 1 };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Administration</div><h1>Audit log</h1></div>
      </div>
      <p class="helper-text" style="margin-bottom:14px;">Every action that changes data &mdash; adding a patient, recording a payment, booking an appointment, and so on &mdash; is recorded here automatically with who did it and when.</p>
      <div class="card"><div id="audit-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    await loadTable();
  }

  async function loadTable() {
    const result = await Api.get(`/api/audit-logs?page=${state.page}&limit=50`);
    const el = document.getElementById('audit-table');
    if (!result.data.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#128269;</div>No activity recorded yet.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Status</th></tr></thead>
        <tbody>
          ${result.data.map((a) => `
            <tr>
              <td style="white-space:nowrap;">${formatTimestamp(a.created_at)}</td>
              <td>${App.escapeHtml(a.username || '&mdash;')}</td>
              <td>${methodBadge(a.method)} <code style="font-size:12px;">${App.escapeHtml(a.path)}</code>${a.details ? `<div class="helper-text" style="max-width:420px; word-break:break-word;">${App.escapeHtml(a.details)}</div>` : ''}</td>
              <td><span class="badge ${a.status_code < 300 ? 'sage' : 'ochre'}">${a.status_code}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12.5px; color:var(--ink-soft);">
        <span>Page ${result.page} of ${result.totalPages || 1} &middot; ${result.total} entries</span>
        <div>
          <button class="btn secondary small" id="prev-page" ${result.page <= 1 ? 'disabled' : ''}>&larr; Prev</button>
          <button class="btn secondary small" id="next-page" ${result.page >= result.totalPages ? 'disabled' : ''}>Next &rarr;</button>
        </div>
      </div>
    `;
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; loadTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; loadTable(); });
  }

  function methodBadge(method) {
    const map = { POST: 'sage', PUT: 'ochre', DELETE: 'coral' };
    return `<span class="badge ${map[method] || 'gray'}">${method}</span>`;
  }

  function formatTimestamp(ts) {
    // stored as 'YYYY-MM-DD HH:MM:SS' UTC
    const iso = ts.replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (isNaN(d)) return App.escapeHtml(ts);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return { render };
})();

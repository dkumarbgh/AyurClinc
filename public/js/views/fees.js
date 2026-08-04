window.Views = window.Views || {};

Views.Fees = (() => {
  let state = { status: '', page: 1 };

  async function render() {
    const root = document.getElementById('view-root');
    const summary = await Api.get('/api/fees/summary');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Billing</div><h1>Fees &amp; payments</h1></div>
        <button class="btn" id="btn-new-invoice">+ New invoice</button>
      </div>
      <div class="grid grid-4" style="margin-bottom:20px;">
        <div class="card stat-card good"><div class="label">Total collected</div><div class="value" style="font-size:22px;">${App.fmtMoney(summary.total_collected)}</div></div>
        <div class="card stat-card alert"><div class="label">Total pending</div><div class="value" style="font-size:22px;">${App.fmtMoney(summary.total_pending)}</div></div>
        <div class="card stat-card"><div class="label">Pending invoices</div><div class="value">${summary.pending_invoices}</div></div>
        <div class="card stat-card"><div class="label">&nbsp;</div><div class="sub">&nbsp;</div></div>
      </div>
      <div class="tab-row">
        <button class="tab-btn ${state.status === '' ? 'active' : ''}" data-status="">All</button>
        <button class="tab-btn ${state.status === 'pending' ? 'active' : ''}" data-status="pending">Pending</button>
        <button class="tab-btn ${state.status === 'partial' ? 'active' : ''}" data-status="partial">Partial</button>
        <button class="tab-btn ${state.status === 'paid' ? 'active' : ''}" data-status="paid">Paid</button>
      </div>
      <div class="card"><div id="fees-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
    `;
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => { state.status = btn.dataset.status; state.page = 1; render(); });
    });
    document.getElementById('btn-new-invoice').addEventListener('click', () => openInvoiceModal());
    await loadTable();
  }

  async function loadTable() {
    const params = new URLSearchParams({ page: state.page, limit: 20 });
    if (state.status) params.set('status', state.status);
    const result = await Api.get(`/api/fees?${params.toString()}`);
    const el = document.getElementById('fees-table');
    if (!result.data.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">&#8377;</div>No fee records found.</div>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Patient</th><th>Purpose</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due date</th><th></th></tr></thead>
        <tbody>
          ${result.data.map((f) => `
            <tr>
              <td>${App.escapeHtml(f.patient_name)} <span class="helper-text">${App.escapeHtml(f.patient_code)}</span></td>
              <td>${App.escapeHtml(f.purpose.replace('_', ' '))}</td>
              <td>${App.fmtMoney(f.amount)}</td>
              <td>${App.fmtMoney(f.amount_paid)}</td>
              <td>${statusBadge(f.payment_status)}</td>
              <td>${App.fmtDate(f.due_date)}</td>
              <td style="white-space:nowrap;">
                ${f.payment_status !== 'paid' ? `<button class="btn small pay-btn" data-id="${f.id}" data-balance="${(f.amount - f.amount_paid).toFixed(2)}" data-name="${App.escapeHtml(f.patient_name)}">Record payment</button>` : ''}
                <button class="btn secondary small pdf-btn" data-id="${f.id}">${f.payment_status === 'paid' ? 'Receipt' : 'Invoice'}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12.5px; color:var(--ink-soft);">
        <span>Page ${result.page} of ${result.totalPages || 1} &middot; ${result.total} record${result.total === 1 ? '' : 's'}</span>
        <div>
          <button class="btn secondary small" id="prev-page" ${result.page <= 1 ? 'disabled' : ''}>&larr; Prev</button>
          <button class="btn secondary small" id="next-page" ${result.page >= result.totalPages ? 'disabled' : ''}>Next &rarr;</button>
        </div>
      </div>
    `;
    el.querySelectorAll('.pay-btn').forEach((btn) => {
      btn.addEventListener('click', () => openPaymentModal(btn.dataset.id, btn.dataset.name, btn.dataset.balance));
    });
    el.querySelectorAll('.pdf-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fee = result.data.find((f) => String(f.id) === btn.dataset.id);
        btn.disabled = true;
        try {
          await PdfDocs.generateInvoiceOrReceipt(fee, { full_name: fee.patient_name, patient_code: fee.patient_code });
        } catch (err) {
          App.toast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; loadTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; loadTable(); });
  }

  function statusBadge(status) {
    const map = { paid: 'sage', pending: 'ochre', partial: 'ochre', refunded: 'gray' };
    return `<span class="badge ${map[status] || 'gray'}">${status}</span>`;
  }

  function openPaymentModal(id, name, balance) {
    App.openModal(`
      <h2>Record payment</h2>
      <p class="helper-text">${name} &mdash; balance due: ${App.fmtMoney(balance)}</p>
      <form id="payment-form">
        <div class="form-grid">
          <div class="form-row"><label>Amount paid *</label><input type="number" step="0.01" min="0.01" name="amount_paid" value="${balance}" required /></div>
          <div class="form-row"><label>Payment method</label>
            <select name="payment_method">
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Confirm payment</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Api.put(`/api/fees/${id}/pay`, fd);
        App.toast('Payment recorded.', 'success');
        App.closeModal();
        await render();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  async function openInvoiceModal() {
    App.openModal(`
      <h2>New invoice</h2>
      <form id="invoice-form">
        <div class="form-row">
          <label>Patient *</label>
          <input id="patient-search-input" placeholder="Type to search by name or phone&hellip;" autocomplete="off" required />
          <input type="hidden" name="patient_id" id="selected-patient-id" />
          <div id="patient-search-results" style="max-height:140px; overflow-y:auto;"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Purpose</label>
            <select name="purpose">
              <option value="consultation">Consultation</option>
              <option value="therapy_session">Therapy session</option>
              <option value="vaccine">Vaccine</option>
              <option value="registration">Registration</option>
              <option value="other" selected>Other</option>
            </select>
          </div>
          <div class="form-row"><label>Amount *</label><input type="number" step="0.01" min="0.01" name="amount" required /></div>
        </div>
        <div class="form-row"><label>Due date</label><input type="date" name="due_date" /></div>
        <div class="form-row"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Create invoice</button>
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

    document.getElementById('invoice-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if (!fd.patient_id) { App.toast('Please select a patient from the search results.', 'error'); return; }
      try {
        await Api.post('/api/fees', fd);
        App.toast('Invoice created.', 'success');
        App.closeModal();
        await render();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  return { render };
})();

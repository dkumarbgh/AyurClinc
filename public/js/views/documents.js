window.Views = window.Views || {};

Views.Documents = (() => {
  let state = { patient: null, tab: 'medical_certificate' };

  const CLINICAL_TABS = [
    { key: 'medical_certificate', label: 'Medical Certificate' },
    { key: 'attendance_record', label: 'Attendance & Treatment Record' },
    { key: 'treatment_summary', label: 'Treatment Summary' },
    { key: 'vaccination_certificate', label: 'Vaccination Certificate' },
  ];
  const BILLING_TABS = [
    { key: 'proof_of_payment', label: 'Proof of Payment' },
    { key: 'insurance_bill', label: 'Insurance Bill' },
    { key: 'invoice_receipt', label: 'Invoice / Receipt' },
  ];

  function visibleTabs() {
    const role = App.currentUser() ? App.currentUser().role : null;
    return role === 'therapist' ? CLINICAL_TABS : [...CLINICAL_TABS, ...BILLING_TABS];
  }

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Documents</div><h1>Prepare a document</h1></div>
      </div>
      <div class="card" style="margin-bottom:18px;">
        <label>Patient</label>
        <input id="doc-patient-search" placeholder="Type to search by name or phone&hellip;" autocomplete="off" value="${state.patient ? App.escapeHtml(state.patient.full_name) : ''}" />
        <div id="doc-patient-results" style="max-height:160px; overflow-y:auto;"></div>
        ${state.patient ? `<p class="helper-text" style="margin-top:8px;">${App.escapeHtml(state.patient.patient_code)} &middot; ${App.escapeHtml(state.patient.phone)} <a href="#" id="doc-change-patient">(change)</a></p>` : ''}
      </div>
      ${state.patient ? `
        <div class="tab-row" style="flex-wrap:wrap;">
          ${visibleTabs().map((t) => `<button class="tab-btn ${state.tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>
        <div id="doc-form-root"></div>
      ` : `<div class="empty-state">Search for a patient above to get started.</div>`}
    `;

    wirePatientSearch();
    if (state.patient) {
      document.getElementById('doc-change-patient').addEventListener('click', (e) => {
        e.preventDefault(); state.patient = null; render();
      });
      root.querySelectorAll('.tab-row .tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
      });
      await renderForm();
    }
  }

  function wirePatientSearch() {
    const input = document.getElementById('doc-patient-search');
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { document.getElementById('doc-patient-results').innerHTML = ''; return; }
        const result = await Api.get(`/api/patients?search=${encodeURIComponent(q)}&limit=8`);
        document.getElementById('doc-patient-results').innerHTML = result.data.map((p) => `
          <div class="patient-pick" data-id="${p.id}" style="padding:7px 4px; cursor:pointer; border-bottom:1px solid var(--line); font-size:13px;">
            ${App.escapeHtml(p.full_name)} <span class="helper-text">${App.escapeHtml(p.patient_code)} &middot; ${App.escapeHtml(p.phone)}</span>
          </div>`).join('') || `<div class="helper-text">No matches.</div>`;
        document.querySelectorAll('.patient-pick').forEach((row) => {
          row.addEventListener('click', async () => {
            state.patient = await Api.get(`/api/patients/${row.dataset.id}`);
            render();
          });
        });
      }, 250);
    });
  }

  async function renderForm() {
    const el = document.getElementById('doc-form-root');
    el.innerHTML = `<div class="empty-state">Loading&hellip;</div>`;
    const settings = await PdfDocs.getSettings();
    const renderers = {
      medical_certificate: renderMedicalCertificateForm,
      attendance_record: renderAttendanceForm,
      treatment_summary: renderTreatmentSummaryForm,
      vaccination_certificate: renderVaccinationForm,
      proof_of_payment: renderProofOfPaymentForm,
      insurance_bill: renderInsuranceBillForm,
      invoice_receipt: renderInvoiceReceiptForm,
    };
    (renderers[state.tab] || renderMedicalCertificateForm)(el, settings);
  }

  function todayVal() { return new Date().toISOString().slice(0, 10); }

  // ---------------- Medical Certificate ----------------
  function renderMedicalCertificateForm(el, settings) {
    const p = state.patient;
    el.innerHTML = `
      <div class="card">
        <form id="doc-form">
          <div class="form-grid">
            <div class="form-row"><label>Date</label><input type="date" name="date" value="${todayVal()}" /></div>
            <div class="form-row"><label>Age (years)</label><input type="number" name="age" min="0" value="${ageFromDob(p.dob)}" /></div>
          </div>
          <div class="form-row"><label>Symptoms *</label><textarea name="symptoms" rows="2" required placeholder="e.g. fever associated with joint pain, loss of appetite"></textarea></div>
          <div class="form-row"><label>Diagnosis *</label><input name="diagnosis" required placeholder="e.g. Viral Arthritis" /></div>
          <div class="form-row"><label>Advised rest (days)</label><input type="number" name="rest_days" min="0" placeholder="e.g. 20" /></div>
          <div class="form-grid">
            <div class="form-row"><label>Signed by</label><input name="signed_by" value="${App.escapeHtml(settings.default_doctor_name)}" /></div>
            <div class="form-row"><label>Registration No.</label><input name="reg_no" value="${App.escapeHtml(settings.default_doctor_reg_no)}" /></div>
          </div>
          <button type="submit" class="btn">Generate PDF</button>
        </form>
      </div>
    `;
    bindSubmit('doc-form', async (fd) => PdfDocs.generateMedicalCertificate(p, fd));
  }

  // ---------------- Attendance & Treatment Record ----------------
  let dailyRowsState = []; // [{date, treatment, remarks}] — persists across "Build daily table" clicks within this form

  function renderAttendanceForm(el, settings) {
    const p = state.patient;
    dailyRowsState = [];
    el.innerHTML = `
      <div class="card">
        <form id="doc-form">
          <div class="form-grid">
            <div class="form-row"><label>Treatment from *</label><input type="date" name="treatment_from" id="att-from" required /></div>
            <div class="form-row"><label>Treatment to *</label><input type="date" name="treatment_to" id="att-to" required /></div>
          </div>
          <div class="form-row"><label>Therapies <span class="helper-text">(used as the default for each day below)</span></label><input name="therapies" id="att-therapies" placeholder="e.g. Greeva Basthi, JPS, Kati Basthi, Kashaya Seka, Sarvanga Abhyanga and Swedha" /></div>
          <button type="button" class="btn secondary small" id="build-daily-table" style="margin-bottom:14px;">Build daily table</button>
          <div id="daily-table-root"></div>
          <div class="form-row"><label>Doctor review</label><textarea name="doctor_review" rows="3" placeholder="e.g. The patient attended all treatment sessions regularly...">The patient attended all treatment sessions regularly. The therapy was performed consistently, and the treatment was successful.</textarea></div>
          <div class="form-grid">
            <div class="form-row"><label>Signed by</label><input name="signed_by" value="${App.escapeHtml(settings.default_doctor_name)}" /></div>
            <div class="form-row"><label>Registration No.</label><input name="reg_no" value="${App.escapeHtml(settings.default_doctor_reg_no)}" /></div>
          </div>
          <button type="submit" class="btn">Generate PDF</button>
        </form>
      </div>
    `;
    document.getElementById('build-daily-table').addEventListener('click', buildDailyTable);
    bindSubmit('doc-form', async (fd) => {
      syncDailyRowsFromDom();
      fd.daily_rows = dailyRowsState;
      return PdfDocs.generateAttendanceRecord(p, fd);
    });
  }

  function buildDailyTable() {
    syncDailyRowsFromDom(); // keep whatever's already been typed before regenerating
    const from = document.getElementById('att-from').value;
    const to = document.getElementById('att-to').value;
    if (!from || !to) { App.toast('Pick both treatment dates first.', 'error'); return; }
    if (from > to) { App.toast('Treatment "from" date must be before the "to" date.', 'error'); return; }

    const days = [];
    let cur = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (cur <= end) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

    if (days.length > 90) {
      App.toast('That\u2019s a very long date range (' + days.length + ' days) \u2014 the table will be long, but it\u2019ll still work.', 'error');
    }

    const therapies = document.getElementById('att-therapies').value;
    const existing = {};
    dailyRowsState.forEach((r) => { existing[r.date] = r; });

    dailyRowsState = days.map((d, i) => {
      if (existing[d]) return existing[d]; // preserve edits for dates still in range
      return { date: d, treatment: i === days.length - 1 ? 'Final Review' : (therapies ? 'All' : ''), remarks: '' };
    });

    renderDailyTable();
  }

  function renderDailyTable() {
    const root = document.getElementById('daily-table-root');
    if (!dailyRowsState.length) { root.innerHTML = ''; return; }
    root.innerHTML = `
      <div class="table-wrap" style="margin-bottom:16px; border:1px solid var(--line); border-radius:var(--radius-sm);">
        <table>
          <thead><tr><th style="width:110px;">Date</th><th>Treatment(s) Given</th><th>Remarks</th></tr></thead>
          <tbody>
            ${dailyRowsState.map((r, i) => `
              <tr>
                <td style="white-space:nowrap;">${App.fmtDate(r.date)}</td>
                <td><input type="text" class="daily-treatment-input" data-idx="${i}" value="${App.escapeHtml(r.treatment)}" style="border:none; background:transparent; padding:4px;" /></td>
                <td><input type="text" class="daily-remarks-input" data-idx="${i}" value="${App.escapeHtml(r.remarks)}" style="border:none; background:transparent; padding:4px;" /></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="helper-text" style="margin-top:-10px; margin-bottom:16px;">Edit any day individually above. "Doctor/Therapist Sign" is intentionally left off the form &mdash; it stays blank on the PDF for physical sign-off each day.</p>
    `;
    root.querySelectorAll('.daily-treatment-input').forEach((inp) => {
      inp.addEventListener('input', () => { dailyRowsState[Number(inp.dataset.idx)].treatment = inp.value; });
    });
    root.querySelectorAll('.daily-remarks-input').forEach((inp) => {
      inp.addEventListener('input', () => { dailyRowsState[Number(inp.dataset.idx)].remarks = inp.value; });
    });
  }

  /** Reads the currently-rendered daily table inputs back into dailyRowsState (in case any input change events were missed). */
  function syncDailyRowsFromDom() {
    document.querySelectorAll('.daily-treatment-input').forEach((inp) => {
      const idx = Number(inp.dataset.idx);
      if (dailyRowsState[idx]) dailyRowsState[idx].treatment = inp.value;
    });
    document.querySelectorAll('.daily-remarks-input').forEach((inp) => {
      const idx = Number(inp.dataset.idx);
      if (dailyRowsState[idx]) dailyRowsState[idx].remarks = inp.value;
    });
  }

  // ---------------- Treatment Summary ----------------
  function renderTreatmentSummaryForm(el, settings) {
    const p = state.patient;
    el.innerHTML = `
      <div class="card">
        <form id="doc-form">
          <div class="form-grid">
            <div class="form-row"><label>From date *</label><input type="date" name="from_date" required /></div>
            <div class="form-row"><label>To date *</label><input type="date" name="to_date" required /></div>
          </div>
          <div class="form-row"><label>Age (years)</label><input type="number" name="age" min="0" value="${ageFromDob(p.dob)}" /></div>
          <div class="form-row"><label>Complaint / symptoms *</label><textarea name="complaint" rows="2" required placeholder="e.g. pain over neck area radiating towards both upper limbs"></textarea></div>
          <div class="form-row"><label>Diagnosis *</label><input name="diagnosis" required placeholder="e.g. spondylitis" /></div>
          <div class="form-row"><label>Response to treatment</label><textarea name="response_notes" rows="2" placeholder="e.g. She responded well to the Ayurvedic procedure and found to be normal.">Responded well to the treatment and found to be normal.</textarea></div>
          <div class="form-row"><label>Diet / follow-up advice</label><input name="diet_advice" placeholder="e.g. dietary restrictions and follow up medications" /></div>
          <div class="form-row">
            <label>Treatments given <span class="helper-text">(one per line: Name - Duration)</span></label>
            <textarea name="treatments_text" rows="4" placeholder="Greeva Basthi - 15 days&#10;Kati Basthi - 15 days"></textarea>
          </div>
          <div class="form-row">
            <label>Follow-up medications <span class="helper-text">(one per line: Name - Dosage)</span></label>
            <textarea name="medications_text" rows="4" placeholder="Flexon - cap 1-0-1 for 45 days"></textarea>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Total amount paid</label><input type="number" step="0.01" name="total_amount" placeholder="e.g. 128500" /></div>
            <div class="form-row" style="display:flex; align-items:center; padding-top:22px;">
              <label style="display:flex; align-items:center; gap:8px; margin-bottom:0;"><input type="checkbox" name="repeat_required" style="width:auto;" /> Repeat session required</label>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Signed by</label><input name="signed_by" value="${App.escapeHtml(settings.default_doctor_name)}" /></div>
            <div class="form-row"><label>Registration No.</label><input name="reg_no" value="${App.escapeHtml(settings.default_doctor_reg_no)}" /></div>
          </div>
          <button type="submit" class="btn">Generate PDF</button>
        </form>
      </div>
    `;
    bindSubmit('doc-form', async (fd) => {
      fd.repeat_required = fd.repeat_required === 'on';
      return PdfDocs.generateTreatmentSummary(p, fd);
    });
  }

  // ---------------- Vaccination Certificate ----------------
  function renderVaccinationForm(el) {
    const p = state.patient;
    el.innerHTML = `
      <div class="card">
        <p class="helper-text" style="margin-bottom:14px;">Generated automatically from ${App.escapeHtml(p.full_name)}'s administered vaccination history.</p>
        <button class="btn" id="gen-vax-cert">Generate PDF</button>
      </div>
    `;
    document.getElementById('gen-vax-cert').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const full = await Api.get(`/api/patients/${p.id}`);
        await PdfDocs.generateVaccinationCertificate(full, full.vaccinations);
      } catch (err) { App.toast(err.message, 'error'); }
      finally { e.target.disabled = false; }
    });
  }

  // ---------------- Proof of Payment ----------------
  function renderProofOfPaymentForm(el, settings) {
    const p = state.patient;
    el.innerHTML = `
      <div class="card">
        <form id="doc-form">
          <div class="form-grid">
            <div class="form-row"><label>Date *</label><input type="date" name="date" value="${todayVal()}" required /></div>
            <div class="form-row"><label>Amount *</label><input type="number" step="0.01" name="amount" required placeholder="e.g. 128500" /></div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Treatment from</label><input type="date" name="treatment_from" /></div>
            <div class="form-row"><label>Treatment to</label><input type="date" name="treatment_to" /></div>
          </div>
          <div class="form-row"><label>Treatment type</label><input name="treatment_type" placeholder="e.g. Ayurvedic Treatment" /></div>
          <div class="form-row">
            <label>Mode of payment</label>
            <select name="payment_mode">
              <option>Cash</option><option>Card</option><option>UPI</option><option>Bank Transfer</option><option>Other</option>
            </select>
          </div>
          <div class="form-row"><label>Received by</label><input name="received_by" value="${App.escapeHtml(settings.default_doctor_name)}" /></div>
          <div class="form-row"><label>Note</label><textarea name="note" rows="2">${App.escapeHtml(settings.clinic_name)} accepts only cash payments. Cheques, credit cards, and debit cards are not accepted.</textarea></div>
          <button type="submit" class="btn">Generate PDF</button>
        </form>
      </div>
    `;
    bindSubmit('doc-form', async (fd) => PdfDocs.generateProofOfPayment(p, fd));
  }

  // ---------------- Insurance Bill ----------------
  function renderInsuranceBillForm(el) {
    const p = state.patient;
    if (!p.fees || !p.fees.length) {
      el.innerHTML = `<div class="empty-state">${App.escapeHtml(p.full_name)} has no fee records to bill yet.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="card">
        <form id="doc-form">
          <p class="helper-text" style="margin-bottom:8px;">Select which fee records to include.</p>
          <div style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px; margin-bottom:14px;">
            ${p.fees.map((f) => `
              <label style="display:flex; align-items:center; gap:8px; padding:5px 0; font-size:13px; font-weight:400;">
                <input type="checkbox" name="fee_ids" value="${f.id}" checked style="width:auto;" />
                ${App.escapeHtml(f.purpose.replace('_', ' '))} &mdash; ${App.fmtMoney(f.amount)} <span class="helper-text">(${App.fmtDate(f.created_at.slice(0,10))})</span>
              </label>
            `).join('')}
          </div>
          <div class="form-row"><label>Diagnosis / treatment details</label><textarea name="diagnosis_notes" rows="3" placeholder="Optional details for the insurer"></textarea></div>
          <button type="submit" class="btn">Generate PDF</button>
        </form>
      </div>
    `;
    document.getElementById('doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const selectedIds = fd.getAll('fee_ids').map(String);
      const selectedFees = p.fees.filter((f) => selectedIds.includes(String(f.id)));
      if (!selectedFees.length) { App.toast('Select at least one fee record.', 'error'); return; }
      try {
        await PdfDocs.generateInsuranceBill(p, selectedFees, fd.get('diagnosis_notes'));
      } catch (err) { App.toast(err.message, 'error'); }
    });
  }

  // ---------------- Invoice / Receipt ----------------
  function renderInvoiceReceiptForm(el) {
    const p = state.patient;
    if (!p.fees || !p.fees.length) {
      el.innerHTML = `<div class="empty-state">${App.escapeHtml(p.full_name)} has no fee records yet.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Purpose</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${p.fees.map((f) => `
              <tr>
                <td>${App.escapeHtml(f.purpose.replace('_', ' '))}</td>
                <td>${App.fmtMoney(f.amount)}</td>
                <td><span class="badge ${f.payment_status === 'paid' ? 'sage' : 'ochre'}">${f.payment_status}</span></td>
                <td>${App.fmtDate(f.created_at.slice(0, 10))}</td>
                <td><button class="btn secondary small gen-invoice-btn" data-id="${f.id}">${f.payment_status === 'paid' ? 'Receipt' : 'Invoice'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    el.querySelectorAll('.gen-invoice-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fee = p.fees.find((f) => String(f.id) === btn.dataset.id);
        btn.disabled = true;
        try { await PdfDocs.generateInvoiceOrReceipt(fee, p); }
        catch (err) { App.toast(err.message, 'error'); }
        finally { btn.disabled = false; }
      });
    });
  }

  // ---------------- Shared helpers ----------------
  function ageFromDob(dob) {
    if (!dob) return '';
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : '';
  }

  function bindSubmit(formId, action) {
    document.getElementById(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await action(fd);
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  return { render };
})();

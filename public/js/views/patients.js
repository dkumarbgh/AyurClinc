window.Views = window.Views || {};

Views.Patients = (() => {
  let state = { search: '', page: 1, status: 'active' };

  async function render() {
    const root = document.getElementById('view-root');
    root.innerHTML = `
      <div class="topbar">
        <div><div class="eyebrow">Patients</div><h1>Patient records</h1></div>
        <div>
          <button class="btn secondary" id="btn-import-patients">Import</button>
          <button class="btn" id="btn-add-patient">+ Add patient</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box">
          <input type="search" id="patient-search" placeholder="Search name, phone, or code&hellip;" value="${App.escapeHtml(state.search)}" />
        </div>
        <div class="tab-row">
          <button class="tab-btn ${state.status === 'active' ? 'active' : ''}" data-status="active">Active</button>
          <button class="tab-btn ${state.status === 'inactive' ? 'active' : ''}" data-status="inactive">Inactive</button>
          <button class="tab-btn ${state.status === '' ? 'active' : ''}" data-status="">All</button>
        </div>
      </div>
      <div class="card"><div id="patients-table" class="table-wrap"><div class="empty-state">Loading&hellip;</div></div></div>
      <div id="patient-detail-root"></div>
    `;

    document.getElementById('btn-add-patient').addEventListener('click', () => openPatientForm());
    document.getElementById('btn-import-patients').addEventListener('click', () => openImportModal());
    document.getElementById('patient-search').addEventListener('input', debounce((e) => {
      state.search = e.target.value; state.page = 1; loadTable();
    }, 300));
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => { state.status = btn.dataset.status; state.page = 1; render(); });
    });

    await loadTable();
  }

  async function loadTable() {
    const params = new URLSearchParams({ search: state.search, page: state.page, limit: 20 });
    if (state.status) params.set('status', state.status);
    const result = await Api.get(`/api/patients?${params.toString()}`);
    const tableEl = document.getElementById('patients-table');
    if (!tableEl) return;

    if (!result.data.length) {
      tableEl.innerHTML = `<div class="empty-state"><div class="icon">&#9737;</div>No patients found. Try adjusting your search or add a new patient.</div>`;
      return;
    }

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Gender</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${result.data.map((p) => `
            <tr>
              <td>${App.escapeHtml(p.patient_code)}</td>
              <td><a href="#" class="patient-link" data-id="${p.id}">${App.escapeHtml(p.full_name)}</a></td>
              <td>${App.escapeHtml(p.phone)}</td>
              <td>${App.escapeHtml(p.gender || '&mdash;')}</td>
              <td><span class="badge ${p.status === 'active' ? 'sage' : 'gray'}">${p.status}</span></td>
              <td><button class="btn secondary small edit-patient-btn" data-id="${p.id}">Edit</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12.5px; color:var(--ink-soft);">
        <span>Page ${result.page} of ${result.totalPages || 1} &middot; ${result.total} patient${result.total === 1 ? '' : 's'}</span>
        <div>
          <button class="btn secondary small" id="prev-page" ${result.page <= 1 ? 'disabled' : ''}>&larr; Prev</button>
          <button class="btn secondary small" id="next-page" ${result.page >= result.totalPages ? 'disabled' : ''}>Next &rarr;</button>
        </div>
      </div>
    `;

    tableEl.querySelectorAll('.patient-link').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); showPatientDetail(a.dataset.id); });
    });
    tableEl.querySelectorAll('.edit-patient-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const patient = await Api.get(`/api/patients/${btn.dataset.id}`);
        openPatientForm(patient);
      });
    });
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; loadTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; loadTable(); });
  }

  const IMPORT_TEMPLATE_HEADERS = [
    'full_name', 'phone', 'whatsapp_number', 'dob', 'gender', 'email',
    'address', 'guardian_name', 'guardian_phone', 'blood_group', 'medical_notes',
  ];

  function downloadImportTemplate() {
    const csv = IMPORT_TEMPLATE_HEADERS.join(',') + '\n' +
      'Baby Aarav,+919811100011,,2025-01-15,male,,,Sunita Sharma,+919822200022,,\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'patient_import_template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function openImportModal() {
    App.openModal(`
      <h2>Import patients</h2>
      <p class="helper-text">Upload an Excel (.xlsx/.xls), CSV, or JSON file. Column names are matched
        flexibly (e.g. "Name", "Patient Name", and "full_name" all work) &mdash; only <strong>name</strong>
        and <strong>phone</strong> are required. Patients with a phone number that already exists are skipped.</p>
      <p style="margin:10px 0;"><button type="button" class="btn secondary small" id="download-template-btn">Download CSV template</button></p>
      <form id="import-form">
        <div class="form-row">
          <label>File *</label>
          <input type="file" name="file" id="import-file-input" accept=".xlsx,.xls,.csv,.json" required />
        </div>
        <div id="import-result"></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Close</button>
          <button type="submit" class="btn" id="import-submit-btn">Import</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('download-template-btn').addEventListener('click', downloadImportTemplate);
    document.getElementById('import-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('import-file-input');
      if (!fileInput.files.length) { App.toast('Please choose a file.', 'error'); return; }
      const submitBtn = document.getElementById('import-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Importing\u2026';
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      try {
        const result = await Api.upload('/api/patients/import', fd);
        const resultEl = document.getElementById('import-result');
        resultEl.innerHTML = `
          <div class="card" style="margin:14px 0; background: var(--teal-100); border-color: var(--teal-100);">
            <strong>${result.imported}</strong> imported, <strong>${result.skipped}</strong> skipped.
            ${result.errors.length ? `
              <div style="max-height:160px; overflow-y:auto; margin-top:8px; font-size:12px;">
                ${result.errors.slice(0, 50).map((e) => `<div>Row ${e.row}: ${App.escapeHtml(e.reason)}</div>`).join('')}
                ${result.errors.length > 50 ? `<div class="helper-text">&hellip;and ${result.errors.length - 50} more.</div>` : ''}
              </div>` : ''}
          </div>
        `;
        App.toast(`Import complete: ${result.imported} added.`, 'success');
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Import';
      }
    });
  }

  function openPatientForm(patient) {
    const isEdit = !!patient;
    App.openModal(`
      <h2>${isEdit ? 'Edit patient' : 'Add patient'}</h2>
      <form id="patient-form">
        <div class="form-grid">
          <div class="form-row"><label>Full name *</label><input name="full_name" required value="${App.escapeHtml(patient?.full_name)}" /></div>
          <div class="form-row"><label>Phone *</label><input name="phone" required value="${App.escapeHtml(patient?.phone)}" /></div>
          <div class="form-row"><label>WhatsApp number</label><input name="whatsapp_number" placeholder="If different from phone" value="${App.escapeHtml(patient?.whatsapp_number)}" /></div>
          <div class="form-row"><label>Date of birth</label><input type="date" name="dob" value="${patient?.dob || ''}" /></div>
          <div class="form-row"><label>Gender</label>
            <select name="gender">
              <option value="">&mdash;</option>
              <option value="male" ${patient?.gender === 'male' ? 'selected' : ''}>Male</option>
              <option value="female" ${patient?.gender === 'female' ? 'selected' : ''}>Female</option>
              <option value="other" ${patient?.gender === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-row"><label>Blood group</label><input name="blood_group" value="${App.escapeHtml(patient?.blood_group)}" /></div>
          <div class="form-row"><label>Guardian name</label><input name="guardian_name" value="${App.escapeHtml(patient?.guardian_name)}" /></div>
          <div class="form-row"><label>Guardian phone</label><input name="guardian_phone" value="${App.escapeHtml(patient?.guardian_phone)}" /></div>
        </div>
        <div class="form-row"><label>Address</label><textarea name="address" rows="2">${App.escapeHtml(patient?.address)}</textarea></div>
        <div class="form-row"><label>Medical notes</label><textarea name="medical_notes" rows="2">${App.escapeHtml(patient?.medical_notes)}</textarea></div>
        ${isEdit ? `<div class="form-row"><label>Status</label><select name="status"><option value="active" ${patient.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${patient.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>` : `
        <div class="form-row" style="background:var(--teal-100); border-radius:var(--radius-sm); padding:10px 12px;">
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:0;">
            <input type="checkbox" id="enroll-swarna-checkbox" name="enroll_swarna" style="width:auto;" />
            Also enroll in Swarna Prashana
          </label>
          <div id="swarna-start-date-row" class="hidden" style="margin-top:10px;">
            <label>First dose date</label>
            <input type="date" name="swarna_start_date" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
        </div>
        `}
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">${isEdit ? 'Save changes' : 'Add patient'}</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    const enrollCheckbox = document.getElementById('enroll-swarna-checkbox');
    if (enrollCheckbox) {
      enrollCheckbox.addEventListener('change', () => {
        document.getElementById('swarna-start-date-row').classList.toggle('hidden', !enrollCheckbox.checked);
      });
    }
    document.getElementById('patient-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        if (isEdit) {
          await Api.put(`/api/patients/${patient.id}`, fd);
          App.toast('Patient updated.', 'success');
        } else {
          const created = await Api.post('/api/patients', fd);
          App.toast(created.swarna_enrollment ? 'Patient added and enrolled in Swarna Prashana.' : 'Patient added.', 'success');
        }
        App.closeModal();
        await loadTable();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  async function showPatientDetail(id) {
    const p = await Api.get(`/api/patients/${id}`);
    const spDoses = await Api.get(`/api/swarna-prashana/patients/${id}/doses`).catch(() => []);
    const detailRoot = document.getElementById('patient-detail-root');
    detailRoot.innerHTML = `
      <div class="card" style="margin-top:18px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 class="section-title" style="margin-bottom:2px;">${App.escapeHtml(p.full_name)}</h3>
            <div class="helper-text">${App.escapeHtml(p.patient_code)} &middot; ${App.escapeHtml(p.phone)} ${p.dob ? '&middot; DOB ' + App.fmtDate(p.dob) : ''}</div>
          </div>
          <button class="btn secondary small" id="close-detail">Close</button>
        </div>
        <div class="drawer-tabs">
          <button class="tab-active-btn active" data-tab="vaccinations">Vaccinations (${p.vaccinations.length})</button>
          <button class="tab-active-btn" data-tab="sessions">Therapy sessions (${p.sessions.length})</button>
          <button class="tab-active-btn" data-tab="fees">Fees (${p.fees.length})</button>
          <button class="tab-active-btn" data-tab="swarna">Swarna Prashana (${spDoses.length})</button>
          <button class="tab-active-btn" data-tab="documents">Documents</button>
        </div>
        <div id="drawer-content"></div>
      </div>
    `;
    document.getElementById('close-detail').addEventListener('click', () => { detailRoot.innerHTML = ''; });
    detailRoot.querySelectorAll('.tab-active-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        detailRoot.querySelectorAll('.tab-active-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderDrawerTab(btn.dataset.tab, p, spDoses);
      });
    });
    renderDrawerTab('vaccinations', p, spDoses);
    detailRoot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderDrawerTab(tab, p, spDoses) {
    const el = document.getElementById('drawer-content');
    if (tab === 'vaccinations') {
      el.innerHTML = !p.vaccinations.length ? emptyRow('No vaccination records yet.') : `
        <table><thead><tr><th>Vaccine</th><th>Dose</th><th>Scheduled</th><th>Status</th></tr></thead>
        <tbody>${p.vaccinations.map((v) => `
          <tr><td>${App.escapeHtml(v.vaccine_name)}</td><td>${v.dose_number}</td><td>${App.fmtDate(v.scheduled_date)}</td>
          <td>${statusBadge(v.status)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'sessions') {
      el.innerHTML = !p.sessions.length ? emptyRow('No therapy sessions yet.') : `
        <table><thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Therapist</th><th>Status</th></tr></thead>
        <tbody>${p.sessions.map((s) => `
          <tr><td>${App.fmtDate(s.session_date)}</td><td>${s.start_time}&ndash;${s.end_time}</td><td>${App.escapeHtml(s.room_name)}</td>
          <td>${App.escapeHtml(s.therapist_name)}</td><td>${statusBadge(s.status)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'fees') {
      el.innerHTML = !p.fees.length ? emptyRow('No fee records yet.') : `
        <table><thead><tr><th>Purpose</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>${p.fees.map((f) => `
          <tr><td>${App.escapeHtml(f.purpose)}</td><td>${App.fmtMoney(f.amount)}</td><td>${App.fmtMoney(f.amount_paid)}</td>
          <td>${statusBadge(f.payment_status)}</td><td>${App.fmtDate(f.due_date)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'swarna') {
      el.innerHTML = !spDoses.length ? emptyRow('Not enrolled in Swarna Prashana yet.') : `
        <table><thead><tr><th>Dose</th><th>Scheduled</th><th>Call status</th><th>Dose status</th></tr></thead>
        <tbody>${spDoses.map((d) => `
          <tr><td>#${d.dose_number}</td><td>${App.fmtDate(d.scheduled_date)}</td>
          <td>${statusBadge(d.call_status)}</td><td>${statusBadge(d.dose_status)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'documents') {
      el.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; max-width:360px; padding:6px 0;">
          <button class="btn secondary" id="doc-vax-cert">Vaccination certificate</button>
          <button class="btn secondary" id="doc-med-cert">Medical certificate</button>
          <button class="btn secondary" id="doc-insurance">Insurance bill</button>
        </div>
      `;
      document.getElementById('doc-vax-cert').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await PdfDocs.generateVaccinationCertificate(p, p.vaccinations); }
        catch (err) { App.toast(err.message, 'error'); }
        finally { e.target.disabled = false; }
      });
      document.getElementById('doc-med-cert').addEventListener('click', () => openMedicalCertificateModal(p));
      document.getElementById('doc-insurance').addEventListener('click', () => openInsuranceBillModal(p));
    }
  }

  function emptyRow(msg) { return `<div class="empty-state">${msg}</div>`; }

  function openMedicalCertificateModal(patient) {
    const today = new Date().toISOString().slice(0, 10);
    App.openModal(`
      <h2>Generate medical certificate</h2>
      <form id="cert-form">
        <div class="form-row">
          <label>Certificate type</label>
          <select name="title">
            <option value="MEDICAL CERTIFICATE">General medical certificate</option>
            <option value="FITNESS CERTIFICATE">Fitness certificate</option>
            <option value="ATTENDANCE CERTIFICATE">Therapy attendance certificate</option>
          </select>
        </div>
        <div class="form-row">
          <label>Certificate text *</label>
          <textarea name="body_text" rows="6" required placeholder="This is to certify that ${App.escapeHtml(patient.full_name)} was examined/treated at this clinic and...">This is to certify that ${App.escapeHtml(patient.full_name)} was examined/treated at this clinic on ${today}.</textarea>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Issued by</label><input name="issued_by" placeholder="e.g. Dr. Kiran Mehta" /></div>
          <div class="form-row"><label>Valid until (optional)</label><input type="date" name="valid_until" /></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Generate PDF</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('cert-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await PdfDocs.generateMedicalCertificate(patient, fd);
        App.closeModal();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  function openInsuranceBillModal(patient) {
    if (!patient.fees.length) {
      App.toast('This patient has no fee records to bill yet.', 'error');
      return;
    }
    App.openModal(`
      <h2>Generate insurance bill</h2>
      <p class="helper-text">Select which fee records to include.</p>
      <form id="insurance-form">
        <div style="max-height:200px; overflow-y:auto; border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px; margin-bottom:14px;">
          ${patient.fees.map((f) => `
            <label style="display:flex; align-items:center; gap:8px; padding:5px 0; font-size:13px; font-weight:400;">
              <input type="checkbox" name="fee_ids" value="${f.id}" checked style="width:auto;" />
              ${App.escapeHtml(f.purpose.replace('_', ' '))} &mdash; ${App.fmtMoney(f.amount)} <span class="helper-text">(${App.fmtDate(f.created_at.slice(0,10))})</span>
            </label>
          `).join('')}
        </div>
        <div class="form-row"><label>Diagnosis / treatment details</label><textarea name="diagnosis_notes" rows="3" placeholder="Optional details for the insurer"></textarea></div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn">Generate PDF</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', App.closeModal);
    document.getElementById('insurance-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const selectedIds = fd.getAll('fee_ids').map(String);
      const selectedFees = patient.fees.filter((f) => selectedIds.includes(String(f.id)));
      if (!selectedFees.length) { App.toast('Select at least one fee record.', 'error'); return; }
      try {
        await PdfDocs.generateInsuranceBill(patient, selectedFees, fd.get('diagnosis_notes'));
        App.closeModal();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  function statusBadge(status) {
    const map = { pending: 'ochre', administered: 'sage', missed: 'coral', cancelled: 'gray',
      scheduled: 'teal', completed: 'sage', no_show: 'coral', paid: 'sage', partial: 'ochre', refunded: 'gray',
      not_called: 'gray', called: 'teal', no_answer: 'ochre', rejected: 'coral' };
    return `<span class="badge ${map[status] || 'gray'}">${status.replace('_', ' ')}</span>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  return { render };
})();

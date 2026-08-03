/**
 * Generates PDFs (invoices, receipts, certificates, insurance bills)
 * entirely in the browser using jsPDF + jspdf-autotable, loaded via CDN in
 * index.html. This keeps PDF generation out of the server entirely — no
 * new native/npm dependency, nothing that can fail to install on a clinic
 * PC. The one tradeoff: generating a PDF requires the browser to have
 * loaded those CDN scripts, which needs an internet connection the first
 * time (the browser then caches them).
 */
const PdfDocs = (() => {
  const TEAL = [30, 95, 90];
  const INK_SOFT = [90, 100, 98];
  const LINE = [210, 220, 216];

  let cachedSettings = null;
  async function getSettings() {
    if (!cachedSettings) cachedSettings = await Api.get('/api/settings');
    return cachedSettings;
  }

  function ensureLibraryLoaded() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error(
        'PDF tools haven\u2019t finished loading (this needs an internet connection the first time). Please check your connection and try again.'
      );
    }
  }

  function newDoc() {
    ensureLibraryLoaded();
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  /** Draws the clinic letterhead + document title, returns the Y position to start content at. */
  function drawLetterhead(doc, settings, title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...TEAL);
    doc.text(settings.clinic_name || 'Clinic', 15, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK_SOFT);
    const contactLine = [settings.address, settings.phone && `Ph: ${settings.phone}`, settings.email]
      .filter(Boolean).join('  |  ');
    if (contactLine) doc.text(contactLine, 15, 24);
    if (settings.registration_number) doc.text(`Reg. No: ${settings.registration_number}`, 15, 29);

    doc.setDrawColor(...LINE);
    doc.line(15, 33, 195, 33);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(title, 15, 43);

    return 43;
  }

  function drawFooter(doc, note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_SOFT);
    doc.text(note || 'This is a computer-generated document.', 15, 285);
  }

  function patientBlock(doc, patient, startY, extraLines = []) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    let y = startY;
    doc.text(`Patient: ${patient.full_name}  (${patient.patient_code})`, 15, y);
    doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, 150, y);
    y += 6;
    if (patient.dob) { doc.text(`DOB: ${patient.dob}`, 15, y); y += 6; }
    if (patient.guardian_name) { doc.text(`Guardian: ${patient.guardian_name}`, 15, y); y += 6; }
    for (const line of extraLines) { doc.text(line, 15, y); y += 6; }
    return y + 4;
  }

  function money(n) {
    return 'Rs. ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Converts a number to words using the Indian numbering system (lakh/crore), e.g. 128500 -> "One Lakh Twenty Eight Thousand Five Hundred Rupees Only". */
  function amountInWords(num) {
    num = Math.round(Number(num) || 0);
    if (num === 0) return 'Zero Rupees Only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const twoDigits = (n) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
    const threeDigits = (n) => (n < 100 ? twoDigits(n) : ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : ''));

    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    const hundred = num;

    const parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));
    return parts.join(' ') + ' Rupees Only';
  }

  /** Subject pronoun for composing certificate body text from a patient's recorded gender. */
  function pronoun(gender) {
    if (gender === 'male') return 'he';
    if (gender === 'female') return 'she';
    return 'they';
  }

  /** Approximate age in years from a YYYY-MM-DD date of birth. */
  function ageFromDob(dob) {
    if (!dob) return '';
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : '';
  }

  /** Formats a YYYY-MM-DD date as "27th July 2026", matching the clinic's document style. Falls back to today if blank. */
  function App_fmtDatePretty(dateStr) {
    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    if (isNaN(d)) return dateStr || '';
    const day = d.getDate();
    const suffix = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    return `${day}${suffix} ${month} ${d.getFullYear()}`;
  }

  /** Draws a signature line with a name and optional registration number beneath it. */
  function signatureBlock(doc, y, name, regNo) {
    doc.setDrawColor(...LINE);
    doc.line(120, y, 195, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 20, 20);
    doc.text(name || 'Authorized Signatory', 120, y + 5);
    if (regNo) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK_SOFT);
      doc.text(regNo, 120, y + 10);
    }
  }

  // ---------------- Invoice / Receipt (fee-based) ----------------

  async function generateInvoiceOrReceipt(fee, patient) {
    const settings = await getSettings();
    const isPaid = fee.payment_status === 'paid';
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, isPaid ? 'RECEIPT' : 'INVOICE');
    y = patientBlock(doc, patient, y + 8);

    const balance = Number(fee.amount) - Number(fee.amount_paid);
    doc.autoTable({
      startY: y,
      head: [['Description', 'Amount']],
      body: [[(fee.purpose || 'other').replace(/_/g, ' '), money(fee.amount)]],
      foot: isPaid
        ? [['Amount Paid', money(fee.amount_paid)], ['Payment Method', (fee.payment_method || '\u2014').toUpperCase()]]
        : [['Amount Paid', money(fee.amount_paid)], ['Balance Due', money(balance)]],
      theme: 'grid',
      headStyles: { fillColor: TEAL },
      footStyles: { fillColor: [240, 244, 243], textColor: 20 },
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (isPaid && fee.paid_date) doc.text(`Paid on: ${fee.paid_date}`, 15, finalY);
    else if (fee.due_date) doc.text(`Due date: ${fee.due_date}`, 15, finalY);

    drawFooter(doc, isPaid ? 'Thank you for your payment.' : 'Please settle this invoice by the due date.');
    doc.save(`${isPaid ? 'receipt' : 'invoice'}_${patient.patient_code}_${fee.id}.pdf`);
  }

  // ---------------- Vaccination certificate ----------------

  async function generateVaccinationCertificate(patient, vaccinations) {
    const settings = await getSettings();
    const administered = vaccinations.filter((v) => v.status === 'administered');
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'VACCINATION CERTIFICATE');
    y = patientBlock(doc, patient, y + 8);

    if (!administered.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('No administered vaccination records found for this patient.', 15, y);
    } else {
      doc.autoTable({
        startY: y,
        head: [['Vaccine', 'Dose #', 'Date Administered', 'Administered By']],
        body: administered.map((v) => [v.vaccine_name, String(v.dose_number), v.administered_date || '\u2014', v.administered_by || '\u2014']),
        theme: 'grid',
        headStyles: { fillColor: TEAL },
      });
    }

    drawFooter(doc, 'This certifies the vaccination record held on file at this clinic as of the date above.');
    doc.save(`vaccination_certificate_${patient.patient_code}.pdf`);
  }

  // ---------------- Medical certificate ----------------
  // Matches the clinic's real format: a clinical-narrative certificate
  // composed from structured fields (symptoms, diagnosis, rest days), shown
  // to staff as editable text before generating so the wording can be
  // adjusted per patient without re-typing the whole thing.

  function composeMedicalCertificateBody(patient, data) {
    const age = data.age || ageFromDob(patient.dob);
    const who = pronoun(patient.gender);
    return `This is to certify that ${patient.full_name}, aged ${age || '____'} years, based on the clinical ` +
      `assessment, ${who} was suffering from ${data.symptoms || '________'}, diagnosed as "${data.diagnosis || '________'}" ` +
      `and was advised to take adequate rest for about ${data.rest_days || '____'} days and undergo appropriate medical treatment.`;
  }

  async function generateMedicalCertificate(patient, cert) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'MEDICAL CERTIFICATE');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`Date: ${App_fmtDatePretty(cert.date)}`, 15, y + 8);
    y += 16;

    doc.setFontSize(10.5);
    const bodyLines = doc.splitTextToSize(cert.body_text || composeMedicalCertificateBody(patient, cert), 180);
    doc.text(bodyLines, 15, y);
    y = y + bodyLines.length * 5.5 + 20;

    signatureBlock(doc, y, cert.signed_by || settings.default_doctor_name, cert.reg_no || settings.default_doctor_reg_no);

    drawFooter(doc, 'This is a computer-generated document and is valid without a physical signature.');
    doc.save(`medical_certificate_${patient.patient_code}.pdf`);
  }

  // ---------------- Proof of payment / receipt ----------------

  async function generateProofOfPayment(patient, data) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'PROOF OF PAYMENT');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(20, 20, 20);
    y += 8;

    const rows = [
      ['Date', App_fmtDatePretty(data.date)],
      ['Received From', patient.full_name],
      ['Treatment Period', `${App_fmtDatePretty(data.treatment_from)} to ${App_fmtDatePretty(data.treatment_to)}`],
      ['Treatment Type', data.treatment_type || '\u2014'],
      ['Total Amount Paid', `${money(data.amount)}/- (${amountInWords(data.amount)})`],
      ['Mode of Payment', data.payment_mode || '\u2014'],
    ];
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 15, y);
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(String(value), 130);
      doc.text(valueLines, 65, y);
      y += 6 * valueLines.length + 2;
    }

    if (data.note) {
      y += 4;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      const noteLines = doc.splitTextToSize(`Note: ${data.note}`, 180);
      doc.text(noteLines, 15, y);
      y += noteLines.length * 5 + 6;
    }

    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text('Received By', 120, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('(Signature & Stamp)', 120, y + 5);
    doc.setDrawColor(...LINE);
    doc.line(120, y + 9, 195, y + 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(data.received_by || settings.default_doctor_name || 'Authorized Signatory', 120, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_SOFT);
    if (settings.clinic_name) doc.text(settings.clinic_name, 120, y + 20);
    if (settings.address) doc.text(doc.splitTextToSize(settings.address, 75), 120, y + 25);

    drawFooter(doc);
    doc.save(`proof_of_payment_${patient.patient_code}.pdf`);
  }

  // ---------------- Attendance & treatment record ----------------

  function dateRange(from, to) {
    const dates = [];
    let cur = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  async function generateAttendanceRecord(patient, data) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'PATIENT ATTENDANCE & TREATMENT RECORD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`Patient Name: ${patient.full_name}`, 15, y + 8);
    doc.text(`Treatment Period: ${App_fmtDatePretty(data.treatment_from)} to ${App_fmtDatePretty(data.treatment_to)}`, 15, y + 14);
    const therapyLines = doc.splitTextToSize(`Therapies: ${data.therapies || '\u2014'}`, 180);
    doc.text(therapyLines, 15, y + 20);
    y = y + 20 + therapyLines.length * 5 + 6;

    // Prefer explicit day-by-day rows (built on the page and possibly hand-edited);
    // fall back to auto-generating one row per day in the range if not supplied.
    let body;
    if (Array.isArray(data.daily_rows) && data.daily_rows.length) {
      body = data.daily_rows.map((row) => [
        new Date(row.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
        row.treatment || '',
        '', // Doctor/Therapist Sign — left blank for physical signature each day
        row.remarks || '',
      ]);
    } else {
      const days = dateRange(data.treatment_from, data.treatment_to);
      body = days.map((d, i) => [
        new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
        i === days.length - 1 ? 'Final Review' : (data.therapies ? 'All' : ''),
        '',
        '',
      ]);
    }

    doc.autoTable({
      startY: y,
      head: [['Date', 'Treatment(s) Given', 'Doctor/Therapist Sign', 'Remarks']],
      body,
      theme: 'grid',
      headStyles: { fillColor: TEAL },
      styles: { fontSize: 9 },
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    if (data.doctor_review) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Doctor Review:', 15, finalY);
      doc.setFont('helvetica', 'normal');
      const reviewLines = doc.splitTextToSize(data.doctor_review, 180);
      doc.text(reviewLines, 15, finalY + 6);
      finalY += 6 + reviewLines.length * 5 + 8;
    }

    signatureBlock(doc, finalY + 6, data.signed_by || settings.default_doctor_name, data.reg_no || settings.default_doctor_reg_no);

    drawFooter(doc);
    doc.save(`attendance_record_${patient.patient_code}.pdf`);
  }

  // ---------------- Treatment summary (discharge-style letter) ----------------

  /** Parses a textarea where each line is "Name - Detail" into {name, detail} rows. */
  function parseItemLines(text) {
    return (text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf('-');
        return idx === -1
          ? { name: line, detail: '' }
          : { name: line.slice(0, idx).trim(), detail: line.slice(idx + 1).trim() };
      });
  }

  async function generateTreatmentSummary(patient, data) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'TREATMENT SUMMARY');

    const age = data.age || ageFromDob(patient.dob);
    const who = pronoun(patient.gender);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(20, 20, 20);

    const intro =
      `I have treated ${patient.full_name} aged about ${age || '____'} years as out patient from the date of ` +
      `${App_fmtDatePretty(data.from_date)} to ${App_fmtDatePretty(data.to_date)}. Since ${who} was suffering from ` +
      `${data.complaint || '________'}. Diagnosed as ${data.diagnosis || '________'}. ${data.response_notes || ''} ` +
      `${data.diet_advice ? 'Advised ' + data.diet_advice + '.' : ''}`;
    const introLines = doc.splitTextToSize(intro.trim(), 180);
    doc.text(introLines, 15, y + 8);
    y = y + 8 + introLines.length * 5.5 + 8;

    const treatments = parseItemLines(data.treatments_text);
    const medications = parseItemLines(data.medications_text);

    if (treatments.length) {
      doc.setFont('helvetica', 'bold');
      doc.text('The details of treatment are as below:', 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      for (const t of treatments) {
        doc.text(`${t.name}${t.detail ? '  \u2014  ' + t.detail : ''}`, 20, y);
        y += 6;
      }
      y += 4;
    }

    if (medications.length) {
      doc.setFont('helvetica', 'bold');
      doc.text('Follow-up Medications:', 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      for (const m of medications) {
        doc.text(`${m.name}${m.detail ? '  \u2014  ' + m.detail : ''}`, 20, y);
        y += 6;
      }
      y += 4;
    }

    if (data.repeat_required) {
      doc.setFont('helvetica', 'bold');
      doc.text('Repeat Session Required', 15, y);
      y += 8;
    }

    if (data.total_amount) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Amount Paid for Consultation and Treatment \u2014 ${money(data.total_amount)}`, 15, y);
      y += 10;
    }

    signatureBlock(doc, y + 6, data.signed_by || settings.default_doctor_name, data.reg_no || settings.default_doctor_reg_no);

    drawFooter(doc);
    doc.save(`treatment_summary_${patient.patient_code}.pdf`);
  }

  // ---------------- Insurance bill (multiple fee line-items) ----------------

  async function generateInsuranceBill(patient, fees, diagnosisNotes) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, 'INSURANCE BILL');
    y = patientBlock(doc, patient, y + 8, patient.guardian_phone ? [`Guardian phone: ${patient.guardian_phone}`] : []);

    if (diagnosisNotes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Diagnosis / Treatment Details:', 15, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(diagnosisNotes, 180);
      doc.text(lines, 15, y + 5);
      y = y + 5 + lines.length * 5 + 6;
    }

    const total = fees.reduce((sum, f) => sum + Number(f.amount), 0);
    const totalPaid = fees.reduce((sum, f) => sum + Number(f.amount_paid), 0);

    doc.autoTable({
      startY: y,
      head: [['Date', 'Description', 'Amount']],
      body: fees.map((f) => [f.created_at.slice(0, 10), (f.purpose || 'other').replace(/_/g, ' '), money(f.amount)]),
      foot: [
        ['', 'Total Billed', money(total)],
        ['', 'Total Paid by Patient', money(totalPaid)],
        ['', 'Balance', money(total - totalPaid)],
      ],
      theme: 'grid',
      headStyles: { fillColor: TEAL },
      footStyles: { fillColor: [240, 244, 243], textColor: 20 },
    });

    drawFooter(doc, 'Submitted for insurance reimbursement purposes.');
    doc.save(`insurance_bill_${patient.patient_code}.pdf`);
  }

  return {
    generateInvoiceOrReceipt,
    generateVaccinationCertificate,
    generateMedicalCertificate,
    generateInsuranceBill,
    generateProofOfPayment,
    generateAttendanceRecord,
    generateTreatmentSummary,
    getSettings,
  };
})();

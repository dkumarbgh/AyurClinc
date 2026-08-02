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

  // ---------------- Medical certificate (free text) ----------------

  async function generateMedicalCertificate(patient, cert) {
    const settings = await getSettings();
    const doc = newDoc();
    let y = drawLetterhead(doc, settings, cert.title || 'MEDICAL CERTIFICATE');
    y = patientBlock(doc, patient, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(20, 20, 20);
    const bodyLines = doc.splitTextToSize(cert.body_text || '', 180);
    doc.text(bodyLines, 15, y + 4);
    y = y + 4 + bodyLines.length * 5.5 + 10;

    if (cert.valid_until) { doc.text(`Valid until: ${cert.valid_until}`, 15, y); y += 8; }

    y += 14;
    doc.setDrawColor(...LINE);
    doc.line(120, y, 195, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(cert.issued_by || 'Authorized Signatory', 120, y + 5);
    doc.setTextColor(...INK_SOFT);
    doc.text('Signature', 120, y + 10);

    drawFooter(doc, 'This is a computer-generated document and is valid without a physical signature.');
    doc.save(`medical_certificate_${patient.patient_code}.pdf`);
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
    getSettings,
  };
})();

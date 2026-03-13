// ============================================================
// STATE
// ============================================================
let currentStep = 0;
const totalSteps = 6;
const photoFiles = {}; // { fieldName: dataURL }
let deleteTargetId = null;
let searchDebounceTimer = null;
let draftSaveTimer = null;
let translateTimer = null;
let autoTranslated = false;
let lastPdfBlob = null;
let lastPdfName = '';
let editingReportId = null; // track if editing existing report
let currentCompany = 'CPI'; // 'CPI' or 'ACI'

// ============================================================
// INDEXEDDB — local report storage
// ============================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('GoodsReceivingDB', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('reports')) {
        const store = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
        store.createIndex('invoice_no', 'invoice_no', { unique: false });
        store.createIndex('company_name', 'company_name', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    const store = tx.objectStore('reports');
    const req = store.add(report);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readonly');
    const store = tx.objectStore('reports');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteReportFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    const store = tx.objectStore('reports');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readonly');
    const store = tx.objectStore('reports');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// INIT
// ============================================================
createPhotoSlots();
loadGallery();
checkDraft();
setupDraftAutosave();
setupAutoTranslate();
updateOnlineStatus();

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
  const bar = document.getElementById('statusBar');
  const text = document.getElementById('statusText');
  if (!navigator.onLine) {
    bar.style.display = 'block';
    bar.className = 'status-bar offline';
    text.textContent = 'ออฟไลน์ — ใช้งานได้ปกติ';
  } else {
    bar.style.display = 'none';
  }
}

// ============================================================
// PHOTO SLOTS
// ============================================================
function createPhotoSlots() {
  for (let page = 1; page <= 5; page++) {
    const container = document.getElementById(`grid_page${page}`);
    if (!container) continue;
    for (let i = 0; i < 4; i++) {
      const fieldName = `page${page}_photo_${i}`;
      container.innerHTML += `
        <div class="photo-slot" id="slot_${fieldName}">
          <input type="file" accept="image/*"
                 onchange="handlePhoto(this, '${fieldName}')" class="photo-input">
          <div class="photo-placeholder-ui" onclick="this.previousElementSibling.click()">
            <div class="camera-icon">&#128247;</div>
            <span>รูปที่ ${i + 1}</span>
          </div>
          <div class="photo-preview" style="display:none">
            <img src="" alt="preview">
            <button type="button" class="btn-retake"
                    onclick="retakePhoto(this, '${fieldName}')">ถ่ายใหม่</button>
          </div>
        </div>`;
    }
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function goToStep(step) {
  if (step < 0 || step >= totalSteps) return;
  currentStep = step;
  document.querySelectorAll('.wizard-step').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.step) === step);
  });
  document.querySelectorAll('.progress-steps .step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', s < step);
  });
  document.getElementById('progressFill').style.width = (step / (totalSteps - 1)) * 100 + '%';
  document.getElementById('btnPrev').style.visibility = step === 0 ? 'hidden' : 'visible';
  if (step === totalSteps - 1) {
    document.getElementById('btnNext').style.display = 'none';
    document.getElementById('btnSubmit').style.display = 'block';
  } else {
    document.getElementById('btnNext').style.display = 'block';
    document.getElementById('btnSubmit').style.display = 'none';
  }
  window.scrollTo(0, 0);
  if (step === 5) initSignature();
}

function nextStep() { goToStep(currentStep + 1); }
function prevStep() { goToStep(currentStep - 1); }

document.querySelectorAll('.progress-steps .step').forEach(el => {
  el.addEventListener('click', () => {
    const target = Number(el.dataset.step);
    if (target <= currentStep) goToStep(target);
  });
});

// ============================================================
// PDC
// ============================================================
function addPdc() {
  const container = document.getElementById('pdcContainer');
  const row = document.createElement('div');
  row.className = 'pdc-row';
  row.innerHTML = `
    <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000014">
    <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)">&times;</button>`;
  container.appendChild(row);
  updatePdcRemoveButtons();
}
function removePdc(btn) { btn.closest('.pdc-row').remove(); updatePdcRemoveButtons(); }
function updatePdcRemoveButtons() {
  const rows = document.querySelectorAll('#pdcContainer .pdc-row');
  rows.forEach(row => {
    const btn = row.querySelector('.btn-remove-pdc');
    if (btn) btn.style.display = rows.length > 1 ? 'flex' : 'none';
  });
}

// ============================================================
// COMPANY TOGGLE
// ============================================================
function toggleCompany() {
  const toggle = document.getElementById('companyToggle');
  currentCompany = toggle.checked ? 'ACI' : 'CPI';
  applyCompanyMode();
}

function applyCompanyMode() {
  const isACI = currentCompany === 'ACI';
  document.getElementById('companyToggle').checked = isACI;
  document.getElementById('switchCPI').classList.toggle('active', !isACI);
  document.getElementById('switchACI').classList.toggle('active', isACI);
  document.getElementById('topBarCompany').textContent = isACI ? 'ASIA COMPACT INDUSTRY' : 'COMPACT INTERNATIONAL';
  document.getElementById('pdcLabel').textContent = isACI ? 'เลขที่ PO เพิ่มเติม' : 'เลขที่ PDC';
  document.getElementById('btnAddPdc').textContent = isACI ? '+ เพิ่มเลขที่ PO เพิ่มเติม' : '+ เพิ่มเลขที่ PDC';
}

// ============================================================
// PHOTO HANDLING — store as dataURL (for offline + PDF)
// ============================================================
function handlePhoto(input, fieldName) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 1200, (resizedBlob) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      photoFiles[fieldName] = e.target.result; // dataURL
      const slot = document.getElementById('slot_' + fieldName);
      const placeholder = slot.querySelector('.photo-placeholder-ui');
      const preview = slot.querySelector('.photo-preview');
      const img = preview.querySelector('img');
      img.src = e.target.result;
      placeholder.style.display = 'none';
      preview.style.display = 'block';
      slot.style.border = 'none';
    };
    reader.readAsDataURL(resizedBlob);
  });
}

function retakePhoto(btn, fieldName) {
  delete photoFiles[fieldName];
  const slot = document.getElementById('slot_' + fieldName);
  const input = slot.querySelector('.photo-input');
  slot.querySelector('.photo-preview').style.display = 'none';
  slot.querySelector('.photo-placeholder-ui').style.display = 'flex';
  slot.style.border = '2px dashed #ddd';
  input.value = '';
  input.click();
}

function resizeImage(file, maxDim, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(callback, 'image/jpeg', 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// SIGNATURE
// ============================================================
let sigCanvas, sigCtx, sigDrawing = false;

function initSignature() {
  sigCanvas = document.getElementById('signatureCanvas');
  if (!sigCanvas) return;
  const rect = sigCanvas.getBoundingClientRect();
  sigCanvas.width = rect.width; sigCanvas.height = rect.height;
  const newCanvas = sigCanvas.cloneNode(true);
  sigCanvas.parentNode.replaceChild(newCanvas, sigCanvas);
  sigCanvas = newCanvas;
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.strokeStyle = '#000'; sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round'; sigCtx.lineJoin = 'round';
  sigCanvas.addEventListener('touchstart', sigStart, { passive: false });
  sigCanvas.addEventListener('touchmove', sigMove, { passive: false });
  sigCanvas.addEventListener('touchend', sigEnd);
  sigCanvas.addEventListener('mousedown', sigStart);
  sigCanvas.addEventListener('mousemove', sigMove);
  sigCanvas.addEventListener('mouseup', sigEnd);
  sigCanvas.addEventListener('mouseleave', sigEnd);
}
function getSigPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}
function sigStart(e) { e.preventDefault(); sigDrawing = true; const p = getSigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }
function sigMove(e) { if (!sigDrawing) return; e.preventDefault(); const p = getSigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }
function sigEnd() { sigDrawing = false; }
function clearSignature() { if (sigCanvas && sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); }
function getSignatureData() {
  if (!sigCanvas) return null;
  const data = sigCanvas.getContext('2d').getImageData(0, 0, sigCanvas.width, sigCanvas.height).data;
  for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) return sigCanvas.toDataURL('image/png'); }
  return null;
}

// ============================================================
// FORM SUBMISSION — generate PDF locally, save to IndexedDB
// ============================================================
async function submitForm() {
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.getElementById('loadingText').textContent = 'กำลังสร้าง PDF...';

  try {
    const reportData = {
      product_type: document.getElementById('productType').value.trim(),
      received_date: document.getElementById('receivedDate').value,
      company_name: document.getElementById('companyName').value.trim(),
      invoice_no: document.getElementById('invoiceNo').value.trim(),
      po_no: document.getElementById('poNo').value.trim(),
      pdcArray: Array.from(document.querySelectorAll('.pdc-input')).map(i => i.value.trim()).filter(Boolean),
      comment_thai: document.getElementById('commentThai').value.trim(),
      comment_english: document.getElementById('commentEnglish').value.trim(),
      recorder_name: document.getElementById('recorderName').value.trim(),
      recorder_position: document.getElementById('recorderPosition').value.trim(),
      photos: { ...photoFiles },
      signature_data: getSignatureData(),
      company: currentCompany,
    };

    // Generate PDF client-side
    const pdf = await generateReportPDF(reportData);
    const pdfName = `report_${reportData.invoice_no || Date.now()}.pdf`;
    lastPdfBlob = pdf.output('blob');
    lastPdfName = pdfName;

    // Save report metadata + PDF blob + full form data to IndexedDB
    const dbRecord = {
      invoice_no: reportData.invoice_no,
      po_no: reportData.po_no,
      product_type: reportData.product_type,
      company_name: reportData.company_name,
      received_date: reportData.received_date,
      recorder_name: reportData.recorder_name,
      comment_thai: reportData.comment_thai,
      company: currentCompany,
      pdf_blob: lastPdfBlob,
      pdf_name: pdfName,
      created_at: new Date().toISOString(),
      // Full form data for edit & re-export
      form_data: reportData,
    };

    if (editingReportId) {
      // Delete old report, save as new
      await deleteReportFromDB(editingReportId);
      editingReportId = null;
    }
    await saveReport(dbRecord);
    clearDraft();

    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('successOverlay').style.display = 'flex';
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    alert('เกิดข้อผิดพลาด: ' + err.message);
    console.error(err);
  }
}

function downloadLastPDF() {
  if (!lastPdfBlob) return;
  const url = URL.createObjectURL(lastPdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lastPdfName;
  a.click();
  URL.revokeObjectURL(url);
}

async function shareLastPDF() {
  if (!lastPdfBlob) return;
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([lastPdfBlob], lastPdfName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: lastPdfName });
        return;
      }
    } catch (e) { /* fallback to download */ }
  }
  downloadLastPDF();
}

function resetForm() {
  document.getElementById('successOverlay').style.display = 'none';
  document.querySelectorAll('#formView input[type="text"], #formView input[type="date"], #formView textarea').forEach(el => el.value = '');
  document.getElementById('pdcContainer').innerHTML = `
    <div class="pdc-row">
      <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000003">
      <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)" style="display:none">&times;</button>
    </div>`;
  Object.keys(photoFiles).forEach(k => delete photoFiles[k]);
  document.querySelectorAll('.photo-slot').forEach(slot => {
    const input = slot.querySelector('.photo-input');
    if (input) input.value = '';
    const ph = slot.querySelector('.photo-placeholder-ui');
    const pr = slot.querySelector('.photo-preview');
    if (ph) ph.style.display = 'flex';
    if (pr) pr.style.display = 'none';
    slot.style.border = '2px dashed #ddd';
  });
  clearSignature();
  clearDraft();
  lastPdfBlob = null;
  lastPdfName = '';
  editingReportId = null;
  currentCompany = 'CPI';
  applyCompanyMode();
  showGallery();
}

// ============================================================
// GALLERY
// ============================================================
let galleryVisible = true;

function showForm() {
  galleryVisible = false;
  document.getElementById('galleryView').style.display = 'none';
  document.getElementById('formView').style.display = 'block';
  document.getElementById('galleryIcon').innerHTML = '&#127968;';
  goToStep(0);
}

function showGallery() {
  galleryVisible = true;
  document.getElementById('galleryView').style.display = 'block';
  document.getElementById('formView').style.display = 'none';
  document.getElementById('galleryIcon').innerHTML = '&#127968;';
  loadGallery();
  checkDraft();
}

function toggleGallery() {
  if (galleryVisible) showForm();
  else showGallery();
}

function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadGallery(), 400);
}

async function loadGallery() {
  const list = document.getElementById('galleryList');
  list.innerHTML = '<p class="gallery-loading">กำลังโหลด...</p>';

  try {
    let reports = await getAllReports();
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Search filter
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    if (search) {
      reports = reports.filter(r =>
        (r.invoice_no || '').toLowerCase().includes(search) ||
        (r.company_name || '').toLowerCase().includes(search) ||
        (r.po_no || '').toLowerCase().includes(search)
      );
    }

    // Update stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const allReports = await getAllReports();
    document.getElementById('statTotal').textContent = allReports.length;
    document.getElementById('statMonth').textContent = allReports.filter(r => new Date(r.created_at) >= monthStart).length;

    if (!reports.length) {
      list.innerHTML = '<p class="gallery-empty">ยังไม่มีเอกสาร</p>';
      return;
    }

    list.innerHTML = reports.map(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      const title = r.invoice_no || r.product_type || 'ไม่ระบุ';
      const subtitle = [r.company_name, r.po_no].filter(Boolean).join(' | ');
      return `
        <div class="gallery-card-wrapper">
          <div class="gallery-card" onclick="openReport(${r.id})">
            <div class="gallery-card-icon">&#128196;</div>
            <div class="gallery-card-info">
              <div class="gallery-card-title">${title}</div>
              <div class="gallery-card-meta">${subtitle || date}</div>
              ${subtitle ? `<div class="gallery-card-meta">${date}</div>` : ''}
            </div>
            <div class="gallery-card-arrow">&#8250;</div>
          </div>
          <button type="button" class="btn-edit-report" onclick="event.stopPropagation();editReport(${r.id})" title="แก้ไข">&#9998;</button>
          <button type="button" class="btn-delete-report" onclick="event.stopPropagation();deleteReport(${r.id})" title="ลบ">&times;</button>
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="gallery-empty">ไม่สามารถโหลดข้อมูลได้</p>';
  }
}

async function openReport(id) {
  try {
    const report = await getReport(id);
    if (report && report.pdf_blob) {
      const url = URL.createObjectURL(report.pdf_blob);
      window.open(url, '_blank');
    }
  } catch (e) {
    alert('ไม่สามารถเปิดเอกสารได้');
  }
}

// ============================================================
// EDIT & RE-EXPORT
// ============================================================
async function editReport(id) {
  try {
    const report = await getReport(id);
    if (!report || !report.form_data) {
      alert('ไม่สามารถแก้ไขเอกสารนี้ได้ (ไม่มีข้อมูลฟอร์ม)');
      return;
    }
    const fd = report.form_data;

    // Set editing mode
    editingReportId = id;

    // Populate form fields
    document.getElementById('productType').value = fd.product_type || '';
    document.getElementById('receivedDate').value = fd.received_date || '';
    document.getElementById('companyName').value = fd.company_name || '';
    document.getElementById('invoiceNo').value = fd.invoice_no || '';
    document.getElementById('poNo').value = fd.po_no || '';
    document.getElementById('commentThai').value = fd.comment_thai || '';
    document.getElementById('commentEnglish').value = fd.comment_english || '';
    document.getElementById('recorderName').value = fd.recorder_name || '';
    document.getElementById('recorderPosition').value = fd.recorder_position || '';

    // Restore PDC numbers
    if (fd.pdcArray && fd.pdcArray.length > 0) {
      const container = document.getElementById('pdcContainer');
      container.innerHTML = '';
      fd.pdcArray.forEach((val, i) => {
        const row = document.createElement('div');
        row.className = 'pdc-row';
        row.innerHTML = `
          <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000003" value="${val}">
          <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)" style="${i === 0 && fd.pdcArray.length === 1 ? 'display:none' : ''}">&times;</button>`;
        container.appendChild(row);
      });
      updatePdcRemoveButtons();
    }

    // Restore company mode
    if (fd.company) { currentCompany = fd.company; applyCompanyMode(); }

    // Restore photos
    Object.keys(photoFiles).forEach(k => delete photoFiles[k]);
    if (fd.photos) {
      Object.entries(fd.photos).forEach(([fieldName, dataURL]) => {
        photoFiles[fieldName] = dataURL;
        const slot = document.getElementById('slot_' + fieldName);
        if (slot) {
          const placeholder = slot.querySelector('.photo-placeholder-ui');
          const preview = slot.querySelector('.photo-preview');
          const img = preview.querySelector('img');
          img.src = dataURL;
          placeholder.style.display = 'none';
          preview.style.display = 'block';
          slot.style.border = 'none';
        }
      });
    }

    // Switch to form view at step 0
    showForm();
    goToStep(0);
  } catch (e) {
    alert('ไม่สามารถโหลดข้อมูลได้: ' + e.message);
    console.error(e);
  }
}

// ============================================================
// DELETE
// ============================================================
function deleteReport(id) {
  deleteTargetId = id;
  document.getElementById('deleteOverlay').style.display = 'flex';
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    await deleteReportFromDB(deleteTargetId);
    loadGallery();
  } catch (e) { alert('ลบไม่สำเร็จ'); }
  deleteTargetId = null;
  document.getElementById('deleteOverlay').style.display = 'none';
}
function cancelDelete() {
  deleteTargetId = null;
  document.getElementById('deleteOverlay').style.display = 'none';
}

// ============================================================
// DRAFT AUTOSAVE
// ============================================================
function setupDraftAutosave() {
  document.querySelectorAll('#formView input[type="text"], #formView input[type="date"], #formView textarea').forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(saveDraft, 2000);
    });
  });
}

function saveDraft() {
  const draft = {
    productType: document.getElementById('productType').value,
    receivedDate: document.getElementById('receivedDate').value,
    companyName: document.getElementById('companyName').value,
    invoiceNo: document.getElementById('invoiceNo').value,
    poNo: document.getElementById('poNo').value,
    pdcNumbers: Array.from(document.querySelectorAll('.pdc-input')).map(i => i.value),
    commentThai: document.getElementById('commentThai').value,
    commentEnglish: document.getElementById('commentEnglish').value,
    recorderName: document.getElementById('recorderName').value,
    recorderPosition: document.getElementById('recorderPosition').value,
    company: currentCompany,
    currentStep,
    savedAt: new Date().toISOString(),
  };
  const hasContent = draft.productType || draft.companyName || draft.invoiceNo || draft.commentThai;
  if (!hasContent) return;
  try {
    localStorage.setItem('draft', JSON.stringify(draft));
    const indicator = document.getElementById('draftIndicator');
    indicator.style.display = 'block';
    setTimeout(() => { indicator.style.display = 'none'; }, 2000);
  } catch (e) { /* ignore */ }
}

function checkDraft() {
  const banner = document.getElementById('draftBanner');
  try {
    banner.style.display = localStorage.getItem('draft') ? 'block' : 'none';
  } catch (e) { banner.style.display = 'none'; }
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('draft'));
    if (!draft) return;
    document.getElementById('productType').value = draft.productType || '';
    document.getElementById('receivedDate').value = draft.receivedDate || '';
    document.getElementById('companyName').value = draft.companyName || '';
    document.getElementById('invoiceNo').value = draft.invoiceNo || '';
    document.getElementById('poNo').value = draft.poNo || '';
    document.getElementById('commentThai').value = draft.commentThai || '';
    document.getElementById('commentEnglish').value = draft.commentEnglish || '';
    document.getElementById('recorderName').value = draft.recorderName || '';
    document.getElementById('recorderPosition').value = draft.recorderPosition || '';
    if (draft.pdcNumbers && draft.pdcNumbers.length > 0) {
      const container = document.getElementById('pdcContainer');
      container.innerHTML = '';
      draft.pdcNumbers.forEach((val, i) => {
        const row = document.createElement('div');
        row.className = 'pdc-row';
        row.innerHTML = `
          <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000003" value="${val}">
          <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)" style="${i === 0 && draft.pdcNumbers.length === 1 ? 'display:none' : ''}">&times;</button>`;
        container.appendChild(row);
      });
      updatePdcRemoveButtons();
    }
    if (draft.company) { currentCompany = draft.company; applyCompanyMode(); }
    showForm();
    if (draft.currentStep) goToStep(draft.currentStep);
  } catch (e) { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem('draft'); } catch (e) { /* ignore */ }
  const banner = document.getElementById('draftBanner');
  if (banner) banner.style.display = 'none';
}

// ============================================================
// AUTO-TRANSLATE Thai → English
// ============================================================
function setupAutoTranslate() {
  const thaiField = document.getElementById('commentThai');
  const engField = document.getElementById('commentEnglish');
  const badge = document.getElementById('autoTranslateBadge');

  thaiField.addEventListener('input', () => {
    clearTimeout(translateTimer);
    translateTimer = setTimeout(autoTranslate, 1500);
  });
  thaiField.addEventListener('blur', () => { clearTimeout(translateTimer); autoTranslate(); });
  engField.addEventListener('input', () => {
    if (autoTranslated) { autoTranslated = false; badge.style.display = 'none'; }
  });
}

async function autoTranslate() {
  const thaiField = document.getElementById('commentThai');
  const engField = document.getElementById('commentEnglish');
  const badge = document.getElementById('autoTranslateBadge');
  const text = thaiField.value.trim();
  if (!text || engField.value.trim() || !navigator.onLine) return;
  try {
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=th|en`);
    const data = await resp.json();
    if (data.responseStatus === 200 && data.responseData.translatedText && !engField.value.trim()) {
      engField.value = data.responseData.translatedText;
      autoTranslated = true;
      badge.style.display = 'inline';
    }
  } catch (e) { /* offline or failed */ }
}

// ============================================================
// SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

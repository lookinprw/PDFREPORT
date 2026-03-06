// === State ===
let currentStep = 0;
const totalSteps = 6; // 0=header, 1-5=pages
const photoFiles = {}; // { fieldName: File }
let currentUser = null;
let deleteTargetId = null;
let searchDebounceTimer = null;
let draftSaveTimer = null;
let translateTimer = null;
let autoTranslated = false;

// ============================================================
// AUTH CHECK — redirect to login if not authenticated
// ============================================================
(async () => {
  try {
    const resp = await fetch('/api/auth/me');
    if (!resp.ok) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = await resp.json();
    initApp();
  } catch (e) {
    window.location.href = '/login.html';
  }
})();

function initApp() {
  setupUserMenu();
  createPhotoSlots();
  loadGallery();
  loadStats();
  checkDraft();
  setupDraftAutosave();
  setupAutoTranslate();
  prefillRecorder();
}

// ============================================================
// USER MENU
// ============================================================
function setupUserMenu() {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('dropdownName');
  const role = document.getElementById('dropdownRole');
  const adminBtn = document.getElementById('btnAdminPanel');

  if (currentUser) {
    avatar.textContent = (currentUser.first_name || currentUser.username).charAt(0).toUpperCase();
    name.textContent = `${currentUser.first_name} ${currentUser.last_name}`.trim() || currentUser.username;
    role.textContent = currentUser.role_display_name;

    if (currentUser.permissions.can_manage_users || currentUser.permissions.can_manage_roles) {
      adminBtn.style.display = 'block';
    }
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) {
    document.getElementById('userDropdown').classList.remove('show');
  }
});

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ============================================================
// PREFILL RECORDER from user profile
// ============================================================
function prefillRecorder() {
  if (!currentUser) return;
  const nameField = document.getElementById('recorderName');
  const posField = document.getElementById('recorderPosition');
  const fullName = `${currentUser.first_name} ${currentUser.last_name}`.trim();
  if (fullName && !nameField.value) nameField.value = fullName;
  if (currentUser.position && !posField.value) posField.value = currentUser.position;
}

// ============================================================
// PHOTO SLOTS
// ============================================================
function createPhotoSlots() {
  const pages = [
    { page: 1, grid: 'grid_page1', labels: ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4'] },
    { page: 2, grid: 'grid_page2', labels: ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4'] },
    { page: 3, grid: 'grid_page3', labels: ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4'] },
    { page: 4, grid: 'grid_page4', labels: ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4'] },
    { page: 5, grid: 'grid_page5', labels: ['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4'] },
  ];
  pages.forEach(({ page, grid, labels }) => {
    const container = document.getElementById(grid);
    if (!container) return;
    for (let i = 0; i < 4; i++) {
      const fieldName = `page${page}_photo_${i}`;
      container.innerHTML += `
        <div class="photo-slot" id="slot_${fieldName}">
          <input type="file" accept="image/*" capture="environment"
                 onchange="handlePhoto(this, '${fieldName}')" class="photo-input">
          <div class="photo-placeholder-ui" onclick="this.previousElementSibling.click()">
            <div class="camera-icon">&#128247;</div>
            <span>${labels[i]}</span>
          </div>
          <div class="photo-preview" style="display:none">
            <img src="" alt="preview">
            <button type="button" class="btn-retake"
                    onclick="retakePhoto(this, '${fieldName}')">ถ่ายใหม่</button>
          </div>
        </div>`;
    }
  });
}

// ============================================================
// NAVIGATION
// ============================================================
function goToStep(step) {
  if (step < 0 || step >= totalSteps) return;
  currentStep = step;

  document.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.step) === step);
  });

  document.querySelectorAll('.progress-steps .step').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', s < step);
  });

  document.getElementById('progressFill').style.width =
    (step / (totalSteps - 1)) * 100 + '%';

  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnSubmit = document.getElementById('btnSubmit');

  btnPrev.style.visibility = step === 0 ? 'hidden' : 'visible';

  if (step === totalSteps - 1) {
    btnNext.style.display = 'none';
    btnSubmit.style.display = 'block';
  } else {
    btnNext.style.display = 'block';
    btnSubmit.style.display = 'none';
  }

  window.scrollTo(0, 0);
  if (step === 5) initSignature();
}

function nextStep() { goToStep(currentStep + 1); }
function prevStep() { goToStep(currentStep - 1); }

document.querySelectorAll('.progress-steps .step').forEach((el) => {
  el.addEventListener('click', () => {
    const target = Number(el.dataset.step);
    if (target <= currentStep) goToStep(target);
  });
});

// ============================================================
// PDC MANAGEMENT
// ============================================================
function addPdc() {
  const container = document.getElementById('pdcContainer');
  const row = document.createElement('div');
  row.className = 'pdc-row';
  row.innerHTML = `
    <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000014">
    <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)">&times;</button>
  `;
  container.appendChild(row);
  updatePdcRemoveButtons();
}

function removePdc(btn) {
  btn.closest('.pdc-row').remove();
  updatePdcRemoveButtons();
}

function updatePdcRemoveButtons() {
  const rows = document.querySelectorAll('#pdcContainer .pdc-row');
  rows.forEach((row) => {
    const btn = row.querySelector('.btn-remove-pdc');
    if (btn) btn.style.display = rows.length > 1 ? 'flex' : 'none';
  });
}

// ============================================================
// PHOTO HANDLING
// ============================================================
function handlePhoto(input, fieldName) {
  const file = input.files[0];
  if (!file) return;

  resizeImage(file, 1200, (resizedBlob) => {
    photoFiles[fieldName] = new File([resizedBlob], file.name, { type: 'image/jpeg' });

    const slot = document.getElementById('slot_' + fieldName);
    const placeholder = slot.querySelector('.photo-placeholder-ui');
    const preview = slot.querySelector('.photo-preview');
    const img = preview.querySelector('img');

    const reader = new FileReader();
    reader.onload = (e) => {
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
  const placeholder = slot.querySelector('.photo-placeholder-ui');
  const preview = slot.querySelector('.photo-preview');

  input.value = '';
  preview.style.display = 'none';
  placeholder.style.display = 'flex';
  slot.style.border = '2px dashed #ddd';
  input.click();
}

function resizeImage(file, maxDim, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(callback, 'image/jpeg', 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// SIGNATURE PAD
// ============================================================
let sigCanvas, sigCtx, sigDrawing = false;

function initSignature() {
  sigCanvas = document.getElementById('signatureCanvas');
  if (!sigCanvas) return;

  const rect = sigCanvas.getBoundingClientRect();
  sigCanvas.width = rect.width;
  sigCanvas.height = rect.height;

  const newCanvas = sigCanvas.cloneNode(true);
  sigCanvas.parentNode.replaceChild(newCanvas, sigCanvas);
  sigCanvas = newCanvas;
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.strokeStyle = '#000';
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

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
function sigStart(e) {
  e.preventDefault(); sigDrawing = true;
  const p = getSigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y);
}
function sigMove(e) {
  if (!sigDrawing) return; e.preventDefault();
  const p = getSigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke();
}
function sigEnd() { sigDrawing = false; }

function clearSignature() {
  if (sigCanvas && sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

function getSignatureData() {
  if (!sigCanvas) return null;
  const data = sigCanvas.getContext('2d').getImageData(0, 0, sigCanvas.width, sigCanvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return sigCanvas.toDataURL('image/png');
  }
  return null;
}

// ============================================================
// FORM SUBMISSION
// ============================================================
async function submitForm() {
  const formData = new FormData();
  formData.append('product_type', document.getElementById('productType').value.trim());
  formData.append('received_date', document.getElementById('receivedDate').value);
  formData.append('company_name', document.getElementById('companyName').value.trim());
  formData.append('invoice_no', document.getElementById('invoiceNo').value.trim());
  formData.append('po_no', document.getElementById('poNo').value.trim());

  const pdcNumbers = [];
  document.querySelectorAll('.pdc-input').forEach((inp) => {
    const v = inp.value.trim();
    if (v) pdcNumbers.push(v);
  });
  formData.append('pdc_numbers', JSON.stringify(pdcNumbers));
  formData.append('comment_thai', document.getElementById('commentThai').value.trim());
  formData.append('comment_english', document.getElementById('commentEnglish').value.trim());
  formData.append('recorder_name', document.getElementById('recorderName').value.trim());
  formData.append('recorder_position', document.getElementById('recorderPosition').value.trim());

  for (const [name, file] of Object.entries(photoFiles)) {
    formData.append(name, file);
  }
  const sigData = getSignatureData();
  if (sigData) formData.append('signature_data', sigData);

  document.getElementById('loadingOverlay').style.display = 'flex';

  try {
    const resp = await fetch('/api/submit', { method: 'POST', body: formData });
    const result = await resp.json();
    document.getElementById('loadingOverlay').style.display = 'none';

    if (result.success) {
      document.getElementById('pdfLink').href = result.pdf_url;
      document.getElementById('successOverlay').style.display = 'flex';
      saveToLocal(result);
      clearDraft();
    } else {
      alert('เกิดข้อผิดพลาด: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    if (!navigator.onLine) {
      alert('บันทึกข้อมูลแบบออฟไลน์ จะส่งเมื่อเชื่อมต่ออินเทอร์เน็ต');
    } else {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  }
}

function resetForm() {
  document.getElementById('successOverlay').style.display = 'none';
  document.querySelectorAll('#formView input[type="text"], #formView input[type="date"], #formView textarea').forEach((el) => el.value = '');

  document.getElementById('pdcContainer').innerHTML = `
    <div class="pdc-row">
      <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000003">
      <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)" style="display:none">&times;</button>
    </div>`;

  Object.keys(photoFiles).forEach((k) => delete photoFiles[k]);
  document.querySelectorAll('.photo-slot').forEach((slot) => {
    const input = slot.querySelector('.photo-input');
    const placeholder = slot.querySelector('.photo-placeholder-ui');
    const preview = slot.querySelector('.photo-preview');
    if (input) input.value = '';
    if (placeholder) placeholder.style.display = 'flex';
    if (preview) preview.style.display = 'none';
    slot.style.border = '2px dashed #ddd';
  });

  clearSignature();
  clearDraft();
  prefillRecorder();
  showGallery();
}

// ============================================================
// GALLERY + VIEWS
// ============================================================
let galleryVisible = true;

function showForm() {
  galleryVisible = false;
  document.getElementById('galleryView').style.display = 'none';
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('formView').style.display = 'block';
  document.getElementById('galleryIcon').innerHTML = '&#127968;';
  goToStep(0);
}

function showGallery() {
  galleryVisible = true;
  document.getElementById('galleryView').style.display = 'block';
  document.getElementById('adminView').style.display = 'none';
  document.getElementById('formView').style.display = 'none';
  document.getElementById('galleryIcon').innerHTML = '&#127968;';
  loadGallery();
  loadStats();
  checkDraft();
}

function showAdminPanel() {
  document.getElementById('userDropdown').classList.remove('show');
  galleryVisible = false;
  document.getElementById('galleryView').style.display = 'none';
  document.getElementById('formView').style.display = 'none';
  document.getElementById('adminView').style.display = 'block';
  document.getElementById('galleryIcon').innerHTML = '&#127968;';
  switchAdminTab('users');
}

function toggleGallery() {
  if (document.getElementById('adminView').style.display !== 'none') {
    showGallery();
  } else if (galleryVisible) {
    showForm();
  } else {
    showGallery();
  }
}

// ============================================================
// SEARCH & FILTER
// ============================================================
function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadGallery(), 400);
}

function toggleDateFilter() {
  const el = document.getElementById('dateFilter');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

// ============================================================
// GALLERY LOADING
// ============================================================
async function loadGallery() {
  const list = document.getElementById('galleryList');
  list.innerHTML = '<p class="gallery-loading">กำลังโหลด...</p>';

  try {
    const params = new URLSearchParams();
    const search = document.getElementById('searchInput').value.trim();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    if (search) params.set('search', search);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    const resp = await fetch('/api/reports?' + params.toString());
    const reports = await resp.json();

    if (!reports.length) {
      list.innerHTML = '<p class="gallery-empty">ยังไม่มีเอกสาร</p>';
      return;
    }

    const canDelete = currentUser && currentUser.permissions.can_delete_report;

    list.innerHTML = reports.map((r) => {
      const date = r.recorded_at ? new Date(r.recorded_at).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      const title = r.invoice_no || r.product_type || r.pdf_path;
      const subtitle = [r.company_name, r.po_no].filter(Boolean).join(' | ');
      const creator = r.creator_first_name ? `${r.creator_first_name} ${r.creator_last_name || ''}`.trim() : '';
      const deleteBtn = canDelete && r.id
        ? `<button type="button" class="btn-delete-report" onclick="event.preventDefault();event.stopPropagation();deleteReport(${r.id})" title="ลบ">&times;</button>`
        : '';
      return `
        <div class="gallery-card-wrapper">
          <a href="/pdf/${r.pdf_path}" target="_blank" class="gallery-card">
            <div class="gallery-card-icon">&#128196;</div>
            <div class="gallery-card-info">
              <div class="gallery-card-title">${title}</div>
              <div class="gallery-card-meta">${subtitle || date}</div>
              ${subtitle ? `<div class="gallery-card-meta">${date}</div>` : ''}
              ${creator ? `<div class="gallery-card-meta gallery-card-creator">โดย ${creator}</div>` : ''}
            </div>
            <div class="gallery-card-arrow">&#8250;</div>
          </a>
          ${deleteBtn}
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="gallery-empty">ไม่สามารถโหลดข้อมูลได้</p>';
  }
}

// ============================================================
// DASHBOARD STATS
// ============================================================
async function loadStats() {
  try {
    const resp = await fetch('/api/reports/stats');
    const stats = await resp.json();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statMonth').textContent = stats.this_month;
    document.getElementById('statMy').textContent = stats.my_reports;
  } catch (e) { /* ignore */ }
}

// ============================================================
// DELETE REPORTS
// ============================================================
function deleteReport(id) {
  deleteTargetId = id;
  document.getElementById('deleteOverlay').style.display = 'flex';
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    const resp = await fetch(`/api/reports/${deleteTargetId}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.success) {
      loadGallery();
      loadStats();
    } else {
      alert(data.error || 'ลบไม่สำเร็จ');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
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
function getDraftKey() {
  return currentUser ? `draft_${currentUser.id}` : null;
}

function setupDraftAutosave() {
  const fields = document.querySelectorAll('#formView input[type="text"], #formView input[type="date"], #formView textarea');
  fields.forEach((el) => {
    el.addEventListener('input', () => {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(saveDraft, 2000);
    });
  });
}

function saveDraft() {
  const key = getDraftKey();
  if (!key) return;

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
    currentStep,
    savedAt: new Date().toISOString(),
  };

  // Only save if there's actual content
  const hasContent = draft.productType || draft.companyName || draft.invoiceNo || draft.poNo || draft.commentThai;
  if (!hasContent) return;

  try {
    localStorage.setItem(key, JSON.stringify(draft));
    const indicator = document.getElementById('draftIndicator');
    indicator.style.display = 'block';
    setTimeout(() => { indicator.style.display = 'none'; }, 2000);
  } catch (e) { /* ignore */ }
}

function checkDraft() {
  const key = getDraftKey();
  if (!key) return;
  const banner = document.getElementById('draftBanner');
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (draft) {
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch (e) {
    banner.style.display = 'none';
  }
}

function restoreDraft() {
  const key = getDraftKey();
  if (!key) return;
  try {
    const draft = JSON.parse(localStorage.getItem(key));
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

    // Restore PDC numbers
    if (draft.pdcNumbers && draft.pdcNumbers.length > 0) {
      const container = document.getElementById('pdcContainer');
      container.innerHTML = '';
      draft.pdcNumbers.forEach((val, i) => {
        const row = document.createElement('div');
        row.className = 'pdc-row';
        row.innerHTML = `
          <input type="text" class="pdc-input" placeholder="เช่น 2601PDC000003" value="${val}">
          <button type="button" class="btn-icon btn-remove-pdc" onclick="removePdc(this)" style="${i === 0 && draft.pdcNumbers.length === 1 ? 'display:none' : ''}">&times;</button>
        `;
        container.appendChild(row);
      });
      updatePdcRemoveButtons();
    }

    showForm();
    if (draft.currentStep) goToStep(draft.currentStep);
  } catch (e) { /* ignore */ }
}

function clearDraft() {
  const key = getDraftKey();
  if (key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
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
    translateTimer = setTimeout(() => autoTranslate(), 1500);
  });

  thaiField.addEventListener('blur', () => {
    clearTimeout(translateTimer);
    autoTranslate();
  });

  // Hide badge when user manually edits English
  engField.addEventListener('input', () => {
    if (autoTranslated) {
      autoTranslated = false;
      badge.style.display = 'none';
    }
  });
}

async function autoTranslate() {
  const thaiField = document.getElementById('commentThai');
  const engField = document.getElementById('commentEnglish');
  const badge = document.getElementById('autoTranslateBadge');

  const text = thaiField.value.trim();
  if (!text || engField.value.trim()) return; // Don't overwrite manual input

  try {
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=th|en`);
    const data = await resp.json();
    if (data.responseStatus === 200 && data.responseData.translatedText) {
      // Only fill if English is still empty
      if (!engField.value.trim()) {
        engField.value = data.responseData.translatedText;
        autoTranslated = true;
        badge.style.display = 'inline';
      }
    }
  } catch (e) { /* translation failed silently */ }
}

// ============================================================
// ADMIN PANEL
// ============================================================
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');

  const tabMap = { users: 'panelUsers', roles: 'panelRoles', activity: 'panelActivity' };
  document.getElementById(tabMap[tab]).style.display = 'block';
  event.target.classList.add('active');

  if (tab === 'users') loadUsers();
  else if (tab === 'roles') loadRoles();
  else if (tab === 'activity') loadActivity();
}

// --- Users ---
async function loadUsers() {
  const list = document.getElementById('usersList');
  list.innerHTML = '<p class="gallery-loading">กำลังโหลด...</p>';
  try {
    const resp = await fetch('/api/users');
    const users = await resp.json();
    list.innerHTML = users.map(u => `
      <div class="admin-card ${!u.is_active ? 'inactive' : ''}">
        <div class="admin-card-info">
          <div class="admin-card-title">${u.first_name} ${u.last_name} <span class="admin-username">@${u.username}</span></div>
          <div class="admin-card-meta">${u.role_display_name} | ${u.position || '-'}</div>
          ${!u.is_active ? '<div class="admin-card-meta" style="color:#dc2626">ปิดใช้งาน</div>' : ''}
        </div>
        <div class="admin-card-actions">
          <button type="button" class="btn-admin-edit" onclick="showEditUserModal(${u.id}, ${JSON.stringify(JSON.stringify(u)).slice(0)})">แก้ไข</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<p class="gallery-empty">ไม่สามารถโหลดข้อมูลได้</p>';
  }
}

function showAddUserModal() {
  showUserModal(null);
}

function showEditUserModal(id, jsonStr) {
  const user = JSON.parse(jsonStr);
  showUserModal(user);
}

async function showUserModal(user) {
  const isEdit = !!user;
  let rolesHtml = '';
  try {
    const resp = await fetch('/api/roles');
    const roles = await resp.json();
    rolesHtml = roles.map(r =>
      `<option value="${r.id}" ${user && user.role_id === r.id ? 'selected' : ''}>${r.display_name}</option>`
    ).join('');
  } catch (e) { /* ignore */ }

  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <h3>${isEdit ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h3>
    <div class="modal-form">
      ${!isEdit ? `<div class="form-group"><label>ชื่อผู้ใช้</label><input type="text" id="modalUsername" value=""></div>` : ''}
      ${!isEdit ? `<div class="form-group"><label>รหัสผ่าน</label><input type="password" id="modalPassword" value=""></div>` : ''}
      ${isEdit ? `<div class="form-group"><label>รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label><input type="password" id="modalPassword" value=""></div>` : ''}
      <div class="form-group"><label>ชื่อจริง</label><input type="text" id="modalFirstName" value="${isEdit ? user.first_name : ''}"></div>
      <div class="form-group"><label>นามสกุล</label><input type="text" id="modalLastName" value="${isEdit ? user.last_name : ''}"></div>
      <div class="form-group"><label>ตำแหน่ง</label><input type="text" id="modalPosition" value="${isEdit ? (user.position || '') : ''}"></div>
      <div class="form-group"><label>บทบาท</label><select id="modalRoleId">${rolesHtml}</select></div>
      ${isEdit ? `<div class="form-group"><label><input type="checkbox" id="modalIsActive" ${user.is_active ? 'checked' : ''}> เปิดใช้งาน</label></div>` : ''}
      <div id="modalError" class="login-error" style="display:none"></div>
      <button type="button" class="btn-primary" style="width:100%;margin-top:8px" onclick="saveUser(${isEdit ? user.id : 'null'})">${isEdit ? 'บันทึก' : 'สร้างผู้ใช้'}</button>
      <button type="button" class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeModal()">ยกเลิก</button>
    </div>
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveUser(userId) {
  const errorEl = document.getElementById('modalError');
  errorEl.style.display = 'none';

  const password = document.getElementById('modalPassword').value;
  const body = {
    first_name: document.getElementById('modalFirstName').value.trim(),
    last_name: document.getElementById('modalLastName').value.trim(),
    position: document.getElementById('modalPosition').value.trim(),
    role_id: parseInt(document.getElementById('modalRoleId').value),
  };
  if (password) body.password = password;

  if (!userId) {
    // Create new user
    body.username = document.getElementById('modalUsername').value.trim();
    if (!body.username || !password) {
      errorEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      errorEl.style.display = 'block';
      return;
    }
  } else {
    const activeEl = document.getElementById('modalIsActive');
    if (activeEl) body.is_active = activeEl.checked;
  }

  try {
    const url = userId ? `/api/users/${userId}` : '/api/users';
    const method = userId ? 'PUT' : 'POST';
    const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json();
    if (resp.ok && data.success) {
      closeModal();
      loadUsers();
    } else {
      errorEl.textContent = data.error || 'บันทึกไม่สำเร็จ';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

// --- Roles ---
async function loadRoles() {
  const list = document.getElementById('rolesList');
  list.innerHTML = '<p class="gallery-loading">กำลังโหลด...</p>';
  try {
    const resp = await fetch('/api/roles');
    const roles = await resp.json();
    const perms = ['can_create_report', 'can_view_all_reports', 'can_delete_report', 'can_manage_users', 'can_manage_roles'];
    const permLabels = { can_create_report: 'สร้าง', can_view_all_reports: 'ดูทั้งหมด', can_delete_report: 'ลบ', can_manage_users: 'จัดการผู้ใช้', can_manage_roles: 'จัดการบทบาท' };

    list.innerHTML = roles.map(r => `
      <div class="admin-card">
        <div class="admin-card-info">
          <div class="admin-card-title">${r.display_name} <span class="admin-username">${r.name}</span> ${r.is_system ? '<span class="badge-system">ระบบ</span>' : ''}</div>
          <div class="admin-card-perms">
            ${perms.map(p => `<span class="perm-badge ${r[p] ? 'perm-on' : 'perm-off'}">${permLabels[p]}</span>`).join('')}
          </div>
        </div>
        <div class="admin-card-actions">
          <button type="button" class="btn-admin-edit" onclick="showEditRoleModal(${JSON.stringify(JSON.stringify(r)).slice(0)})">แก้ไข</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<p class="gallery-empty">ไม่สามารถโหลดข้อมูลได้</p>';
  }
}

function showAddRoleModal() {
  showRoleModal(null);
}

function showEditRoleModal(jsonStr) {
  const role = JSON.parse(jsonStr);
  showRoleModal(role);
}

function showRoleModal(role) {
  const isEdit = !!role;
  const perms = ['can_create_report', 'can_view_all_reports', 'can_delete_report', 'can_manage_users', 'can_manage_roles'];
  const permLabels = { can_create_report: 'สร้างเอกสาร', can_view_all_reports: 'ดูเอกสารทั้งหมด', can_delete_report: 'ลบเอกสาร', can_manage_users: 'จัดการผู้ใช้', can_manage_roles: 'จัดการบทบาท' };

  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <h3>${isEdit ? 'แก้ไขบทบาท' : 'เพิ่มบทบาทใหม่'}</h3>
    <div class="modal-form">
      ${!isEdit ? `<div class="form-group"><label>ชื่อ (อังกฤษ, ไม่มีเว้นวรรค)</label><input type="text" id="modalRoleName" value=""></div>` : ''}
      <div class="form-group"><label>ชื่อที่แสดง</label><input type="text" id="modalRoleDisplayName" value="${isEdit ? role.display_name : ''}"></div>
      <div class="form-group"><label>สิทธิ์</label>
        ${perms.map(p => `
          <label class="perm-checkbox"><input type="checkbox" id="modalPerm_${p}" ${role && role[p] ? 'checked' : ''}> ${permLabels[p]}</label>
        `).join('')}
      </div>
      <div id="modalError" class="login-error" style="display:none"></div>
      <button type="button" class="btn-primary" style="width:100%;margin-top:8px" onclick="saveRole(${isEdit ? role.id : 'null'})">${isEdit ? 'บันทึก' : 'สร้างบทบาท'}</button>
      <button type="button" class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeModal()">ยกเลิก</button>
    </div>
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveRole(roleId) {
  const errorEl = document.getElementById('modalError');
  errorEl.style.display = 'none';
  const perms = ['can_create_report', 'can_view_all_reports', 'can_delete_report', 'can_manage_users', 'can_manage_roles'];

  const body = {
    display_name: document.getElementById('modalRoleDisplayName').value.trim(),
  };
  perms.forEach(p => { body[p] = document.getElementById(`modalPerm_${p}`).checked; });

  if (!roleId) {
    body.name = document.getElementById('modalRoleName').value.trim();
    if (!body.name || !body.display_name) {
      errorEl.textContent = 'กรุณากรอกข้อมูลให้ครบ';
      errorEl.style.display = 'block';
      return;
    }
  }

  try {
    const url = roleId ? `/api/roles/${roleId}` : '/api/roles';
    const method = roleId ? 'PUT' : 'POST';
    const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json();
    if (resp.ok && data.success) {
      closeModal();
      loadRoles();
    } else {
      errorEl.textContent = data.error || 'บันทึกไม่สำเร็จ';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

// --- Activity ---
async function loadActivity() {
  const list = document.getElementById('activityList');
  list.innerHTML = '<p class="gallery-loading">กำลังโหลด...</p>';
  try {
    const resp = await fetch('/api/activity');
    const logs = await resp.json();
    if (!logs.length) {
      list.innerHTML = '<p class="gallery-empty">ยังไม่มีกิจกรรม</p>';
      return;
    }
    const actionLabels = {
      login: 'เข้าสู่ระบบ', create_report: 'สร้างเอกสาร', delete_report: 'ลบเอกสาร',
      create_user: 'สร้างผู้ใช้', update_user: 'แก้ไขผู้ใช้', deactivate_user: 'ปิดบัญชี',
      create_role: 'สร้างบทบาท', update_role: 'แก้ไขบทบาท',
    };
    list.innerHTML = logs.map(l => {
      const date = new Date(l.created_at).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const who = l.first_name ? `${l.first_name} ${l.last_name || ''}`.trim() : l.username || '?';
      return `
        <div class="activity-item">
          <div class="activity-who">${who}</div>
          <div class="activity-action">${actionLabels[l.action] || l.action}</div>
          <div class="activity-time">${date}</div>
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="gallery-empty">ไม่สามารถโหลดข้อมูลได้</p>';
  }
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveToLocal(result) {
  try {
    const history = JSON.parse(localStorage.getItem('report_history') || '[]');
    history.unshift({
      id: result.id,
      pdf_url: result.pdf_url,
      date: new Date().toISOString(),
      invoice: document.getElementById('invoiceNo').value,
    });
    if (history.length > 50) history.length = 50;
    localStorage.setItem('report_history', JSON.stringify(history));
  } catch (e) { /* ignore */ }
}

// ============================================================
// SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ============================================================
// CLIENT-SIDE PDF GENERATION using jsPDF + html2canvas
// Pixel-based layout: A4 = 794 x 1123 px at 96dpi
// ============================================================

// A4 dimensions in pixels (96dpi)
const PG_W = 794;
const PG_H = 1123;
const PG_PAD = 0; // no padding on page div — border is the edge

async function generateReportPDF(data) {
  // Format dates
  let displayDate = '';
  let thaiDay = '', thaiMonth = '', thaiYear = '';
  if (data.received_date) {
    const d = new Date(data.received_date + 'T00:00:00');
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const yearCE = d.getFullYear();
    const yearBE = yearCE + 543;
    displayDate = `${day}/${month}/${yearCE}`;
    thaiDay = String(day);
    thaiMonth = String(month);
    thaiYear = String(yearBE);
  }

  const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const pdcHtml = (data.pdcArray || [])
    .map(p => `<div style="font-weight:700;font-size:14px;">${esc(p)}</div>`)
    .join('');

  // Build photo grid — 2 columns, photos fill available space
  const buildPhotos = (pageNum, maxH) => {
    const imgs = [];
    for (let i = 0; i < 4; i++) {
      const key = `page${pageNum}_photo_${i}`;
      if (data.photos[key]) {
        imgs.push(`<img src="${data.photos[key]}" style="width:100%;height:100%;object-fit:contain;" />`);
      }
    }
    if (imgs.length === 0) return '';
    const cellH = imgs.length <= 2 ? maxH : Math.floor(maxH / 2) - 4;
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px;">
      ${imgs.map(img => `<div style="height:${cellH}px;overflow:hidden;display:flex;align-items:center;justify-content:center;">${img}</div>`).join('')}
    </div>`;
  };

  const sigImg = data.signature_data
    ? `<img src="${data.signature_data}" style="display:block;margin:0 auto 4px;max-height:55px;" />`
    : '';

  // Get logo
  let logoB64 = '';
  try {
    const resp = await fetch('./icons/logo.png');
    const blob = await resp.blob();
    logoB64 = await blobToDataURL(blob);
  } catch (e) {}

  const pageLabels = [
    'วันที่รับสินค้า',
    'การเคลื่อนย้าย',
    'หลังการเคลื่อนย้ายเสร็จ',
    'INVOICE',
    'COMMENT',
  ];

  // Shared CSS for all pages
  const pageCSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .page {
      width:${PG_W}px;
      height:${PG_H}px;
      border:2px solid #000;
      font-family:'Sarabun',sans-serif;
      font-size:14px;
      color:#000;
      background:#fff;
      overflow:hidden;
      display:flex;
      flex-direction:column;
    }
    .row { padding:5px 12px; border-bottom:1px solid #000; }
    .row-header {
      display:flex;
      align-items:center;
      padding:8px 12px;
      border-bottom:1px solid #000;
    }
    .logo { width:65px; height:auto; margin-right:10px; flex-shrink:0; }
    .company { flex:1; }
    .cname { font-size:18px; font-weight:700; }
    .caddr { font-size:11px; color:#333; line-height:1.3; }
    .page-num { text-align:right; white-space:nowrap; font-size:14px; flex-shrink:0; }
    .page-num .num {
      display:inline-block; min-width:28px; text-align:center;
      border-bottom:1px solid #000; font-weight:700; font-size:16px;
    }
    .row-title { text-align:center; font-size:18px; font-weight:700; padding:6px 12px; border-bottom:1px solid #000; }
    .row-field { display:flex; align-items:baseline; padding:4px 12px; border-bottom:1px solid #000; }
    .lbl { font-weight:700; white-space:nowrap; }
    .val { font-weight:700; background:#ffff99; padding:0 6px; margin-left:4px; }
    .right { margin-left:auto; display:flex; align-items:baseline; white-space:nowrap; }
    .val-po { font-weight:700; font-size:16px; background:#ffff99; padding:0 6px; margin-left:4px; }
    .row-photo-label { display:flex; align-items:flex-start; padding:4px 12px; border-bottom:1px solid #000; }
    .pdc { margin-left:auto; text-align:right; }
    .photo-area { flex:1; overflow:hidden; }
  `;

  const headerHTML = (pageNum) => `
    <div class="row-header">
      ${logoB64 ? `<img class="logo" src="${logoB64}" />` : ''}
      <div class="company">
        <div class="cname">COMPACT INTERNATIONAL (1994) CO.,LTD.</div>
        <div class="caddr">36 Moo 4, Nong Chumphon, Khao Yoi District, Petchaburi Province 76140, THAILAND.<br/>TEL. 032-795-044-45 &nbsp; FAX. 032-795-046</div>
      </div>
      <div class="page-num">หน้าที่ : <span class="num">${pageNum}</span> / <span class="num">5</span></div>
    </div>
  `;

  const fieldsHTML = () => `
    <div class="row-title">เอกสารตรวจรับสินค้า</div>
    <div class="row-field">
      <span class="lbl">ประเภทสินค้า :</span>
      <span class="val">${esc(data.product_type)}</span>
    </div>
    <div class="row-field">
      <span class="lbl">วันที่รับสินค้า :</span>
      <span class="val">${displayDate}</span>
      <span class="right"><span class="lbl">เลขที่ INVOICE :</span><span class="val">${esc(data.invoice_no)}</span></span>
    </div>
    <div class="row-field">
      <span class="lbl">บริษัท :</span>
      <span class="val">${esc(data.company_name)}</span>
      <span class="right"><span class="lbl">เลขที่ PO :</span><span class="val-po">${esc(data.po_no)}</span></span>
    </div>
  `;

  // Photo area height: page height minus header (~65) - title(~32) - 3 fields(~90) - photo-label(~28) - border = ~908px available
  const PHOTO_H = 870;

  // Build pages 1-4
  let allPages = '';
  for (let p = 1; p <= 4; p++) {
    allPages += `
      <div class="page" id="pdfPage${p}">
        ${headerHTML(p)}
        ${fieldsHTML()}
        <div class="row-photo-label">
          <span class="lbl">รูปภาพ : ${pageLabels[p - 1]}</span>
          <div class="pdc">${pdcHtml}</div>
        </div>
        <div class="photo-area">
          ${buildPhotos(p, PHOTO_H)}
        </div>
      </div>
    `;
  }

  // Page 5 — comment + photos + signature
  const PAGE5_PHOTO_H = 340;
  allPages += `
    <div class="page" id="pdfPage5">
      ${headerHTML(5)}
      ${fieldsHTML()}
      <div class="row-photo-label">
        <span class="lbl">รูปภาพ : COMMENT</span>
        <div class="pdc">${pdcHtml}</div>
      </div>
      <div class="row" style="min-height:30px;">
        <div style="font-weight:700;margin-bottom:3px;">${esc(data.comment_thai)}</div>
        <div style="font-size:13px;">${esc(data.comment_english)}</div>
      </div>
      <div style="height:${PAGE5_PHOTO_H}px;overflow:hidden;border-bottom:1px solid #000;">
        ${buildPhotos(5, PAGE5_PHOTO_H)}
      </div>
      <div style="padding:8px 12px;text-align:right;flex:1;display:flex;align-items:flex-end;justify-content:flex-end;">
        <div style="border:2px solid #000;padding:10px 18px;text-align:center;min-width:240px;">
          ${sigImg}
          <div style="font-weight:700;text-decoration:underline;font-size:14px;margin-bottom:3px;">ผู้บันทึกข้อมูล</div>
          <div style="font-weight:700;font-size:16px;">${esc(data.recorder_name)}</div>
          <div style="font-weight:700;font-size:13px;">ตำแหน่ง : ${esc(data.recorder_position)}</div>
          <div style="font-size:12px;margin-top:4px;">COMPACT INTERNATIONAL (1994) CO., LTD.</div>
          <div style="margin-top:6px;font-size:14px;">
            <span style="display:inline-block;min-width:36px;text-align:center;border-bottom:1px solid #000;margin:0 2px;font-weight:700;">${thaiDay}</span> /
            <span style="display:inline-block;min-width:36px;text-align:center;border-bottom:1px solid #000;margin:0 2px;font-weight:700;">${thaiMonth}</span> /
            <span style="display:inline-block;min-width:36px;text-align:center;border-bottom:1px solid #000;margin:0 2px;font-weight:700;">${thaiYear}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Create render container
  const container = document.createElement('div');
  container.id = 'pdf-render-area';
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;background:#fff;';
  container.innerHTML = `<style>${pageCSS}</style>${allPages}`;
  document.body.appendChild(container);

  // Wait for all images to load
  const images = container.querySelectorAll('img');
  await Promise.all(Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
  }));
  await new Promise(r => setTimeout(r, 400));

  // Capture each page to PDF
  const pages = container.querySelectorAll('.page');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [PG_W, PG_H], hotfixes: ['px_scaling'] });

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: PG_W,
      height: PG_H,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) pdf.addPage([PG_W, PG_H]);
    pdf.addImage(imgData, 'JPEG', 0, 0, PG_W, PG_H);
  }

  document.body.removeChild(container);
  return pdf;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

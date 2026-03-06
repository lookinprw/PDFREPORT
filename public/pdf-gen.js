// ============================================================
// CLIENT-SIDE PDF GENERATION using jsPDF + html2canvas
// ============================================================

async function generateReportPDF(data) {
  // data = { product_type, received_date, company_name, invoice_no, po_no,
  //          pdcArray, comment_thai, comment_english, recorder_name, recorder_position,
  //          photos: { page1_photo_0: dataURL, ... }, signature_data }

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

  const pdcHtml = (data.pdcArray || [])
    .map(p => `<div style="font-weight:700;font-size:11pt;">${p}</div>`)
    .join('');

  // Build photo HTML for a page
  const buildPhotos = (pageNum) => {
    const imgs = [];
    for (let i = 0; i < 4; i++) {
      const key = `page${pageNum}_photo_${i}`;
      if (data.photos[key]) {
        imgs.push(`<img src="${data.photos[key]}" style="max-width:48%;max-height:200px;object-fit:contain;" />`);
      }
    }
    return imgs.join('');
  };

  const sigImg = data.signature_data
    ? `<img src="${data.signature_data}" style="display:block;margin:0 auto 1mm;max-height:50px;" />`
    : '';

  // Get logo as data URL
  let logoB64 = '';
  try {
    const resp = await fetch('/icons/logo.png');
    const blob = await resp.blob();
    logoB64 = await blobToDataURL(blob);
  } catch (e) { /* no logo */ }

  const pageLabels = [
    'วันที่รับสินค้า',
    'การเคลื่อนย้าย',
    'หลังการเคลื่อนย้ายเสร็จ',
    'INVOICE',
    'COMMENT',
  ];

  // Build header HTML (repeated on every page)
  const headerHTML = (pageNum) => `
    <div style="display:flex;align-items:center;padding:2.5mm 3mm;border-bottom:1pt solid #000;">
      ${logoB64 ? `<img src="${logoB64}" style="width:17mm;height:auto;margin-right:3mm;flex-shrink:0;" />` : ''}
      <div style="flex:1;">
        <div style="font-size:15pt;font-weight:700;">COMPACT INTERNATIONAL (1994) CO.,LTD.</div>
        <div style="font-size:8.5pt;color:#333;line-height:1.3;">36 Moo 4, Nong Chumphon, Khao Yoi District, Petchaburi Province 76140, THAILAND.<br/>TEL. 032-795-044-45 &nbsp; FAX. 032-795-046</div>
      </div>
      <div style="text-align:right;white-space:nowrap;font-size:10.5pt;flex-shrink:0;">
        หน้าที่ : <span style="display:inline-block;min-width:8mm;text-align:center;border-bottom:1pt solid #000;font-weight:700;font-size:12pt;">${pageNum}</span>
        / <span style="display:inline-block;min-width:8mm;text-align:center;border-bottom:1pt solid #000;font-weight:700;font-size:12pt;">5</span>
      </div>
    </div>
  `;

  const fieldsHTML = () => `
    <div style="text-align:center;font-size:14pt;font-weight:700;padding:2mm 3mm;border-bottom:1pt solid #000;">เอกสารตรวจรับสินค้า</div>
    <div style="display:flex;align-items:baseline;padding:1.5mm 3mm;border-bottom:1pt solid #000;">
      <span style="font-weight:700;white-space:nowrap;">ประเภทสินค้า :</span>
      <span style="font-weight:700;background:#ffff99;padding:0 2mm;margin-left:1mm;">${data.product_type || ''}</span>
    </div>
    <div style="display:flex;align-items:baseline;padding:1.5mm 3mm;border-bottom:1pt solid #000;">
      <span style="font-weight:700;white-space:nowrap;">วันที่รับสินค้า :</span>
      <span style="font-weight:700;background:#ffff99;padding:0 2mm;margin-left:1mm;">${displayDate}</span>
      <span style="margin-left:auto;display:flex;align-items:baseline;white-space:nowrap;">
        <span style="font-weight:700;">เลขที่ INVOICE :</span>
        <span style="font-weight:700;background:#ffff99;padding:0 2mm;margin-left:1mm;">${data.invoice_no || ''}</span>
      </span>
    </div>
    <div style="display:flex;align-items:baseline;padding:1.5mm 3mm;border-bottom:1pt solid #000;">
      <span style="font-weight:700;white-space:nowrap;">บริษัท :</span>
      <span style="font-weight:700;background:#ffff99;padding:0 2mm;margin-left:1mm;">${data.company_name || ''}</span>
      <span style="margin-left:auto;display:flex;align-items:baseline;white-space:nowrap;">
        <span style="font-weight:700;">เลขที่ PO :</span>
        <span style="font-weight:700;font-size:12pt;background:#ffff99;padding:0 2mm;margin-left:1mm;">${data.po_no || ''}</span>
      </span>
    </div>
  `;

  // Build pages 1-4 (standard photo pages)
  let fullHTML = '';
  for (let p = 1; p <= 4; p++) {
    fullHTML += `
      <div class="pdf-page" style="width:190mm;border:1.5pt solid #000;font-family:'Sarabun',sans-serif;font-size:11pt;color:#000;page-break-after:always;background:#fff;">
        ${headerHTML(p)}
        ${fieldsHTML()}
        <div style="display:flex;align-items:flex-start;padding:1.5mm 3mm;border-bottom:1pt solid #000;">
          <span style="font-weight:700;">รูปภาพ : ${pageLabels[p - 1]}</span>
          <div style="margin-left:auto;text-align:right;font-weight:700;font-size:11pt;">${pdcHtml}</div>
        </div>
        <div style="padding:2mm;text-align:center;">
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2mm;">${buildPhotos(p)}</div>
        </div>
      </div>
    `;
  }

  // Page 5 — comment + signature
  fullHTML += `
    <div class="pdf-page" style="width:190mm;border:1.5pt solid #000;font-family:'Sarabun',sans-serif;font-size:11pt;color:#000;background:#fff;">
      ${headerHTML(5)}
      ${fieldsHTML()}
      <div style="display:flex;align-items:flex-start;padding:1.5mm 3mm;border-bottom:1pt solid #000;">
        <span style="font-weight:700;">รูปภาพ : COMMENT</span>
        <div style="margin-left:auto;text-align:right;font-weight:700;font-size:11pt;">${pdcHtml}</div>
      </div>
      <div style="padding:2mm 3mm;border-bottom:1pt solid #000;">
        <div style="font-weight:700;margin-bottom:1.5mm;">${data.comment_thai || ''}</div>
        <div style="font-size:10pt;">${data.comment_english || ''}</div>
      </div>
      <div style="padding:2mm;text-align:center;border-bottom:1pt solid #000;">
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2mm;">${buildPhotos(5)}</div>
      </div>
      <div style="padding:2mm 3mm;text-align:right;">
        <div style="display:inline-block;border:1.5pt solid #000;padding:3mm 5mm;text-align:center;min-width:60mm;">
          ${sigImg}
          <div style="font-weight:700;text-decoration:underline;font-size:11pt;margin-bottom:1mm;">ผู้บันทึกข้อมูล</div>
          <div style="font-weight:700;font-size:12pt;">${data.recorder_name || ''}</div>
          <div style="font-weight:700;font-size:10.5pt;">ตำแหน่ง : ${data.recorder_position || ''}</div>
          <div style="font-size:9.5pt;margin-top:1mm;">COMPACT INTERNATIONAL (1994) CO., LTD.</div>
          <div style="margin-top:1.5mm;font-size:10.5pt;">
            <span style="display:inline-block;min-width:10mm;text-align:center;border-bottom:1pt solid #000;margin:0 0.5mm;font-weight:700;">${thaiDay}</span> /
            <span style="display:inline-block;min-width:10mm;text-align:center;border-bottom:1pt solid #000;margin:0 0.5mm;font-weight:700;">${thaiMonth}</span> /
            <span style="display:inline-block;min-width:10mm;text-align:center;border-bottom:1pt solid #000;margin:0 0.5mm;font-weight:700;">${thaiYear}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render in hidden container
  const container = document.createElement('div');
  container.id = 'pdf-render-area';
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;background:#fff;';
  container.innerHTML = fullHTML;
  document.body.appendChild(container);

  // Wait for images to load
  const images = container.querySelectorAll('img');
  await Promise.all(Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));

  // Small delay for rendering
  await new Promise(r => setTimeout(r, 300));

  // Capture each page
  const pages = container.querySelectorAll('.pdf-page');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: pages[i].scrollWidth,
      height: pages[i].scrollHeight,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdfWidth = 210; // A4 width mm
    const pdfHeight = 297; // A4 height mm
    const imgWidth = pdfWidth - 16; // 8mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 8, 8, imgWidth, Math.min(imgHeight, pdfHeight - 16));
  }

  // Cleanup
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

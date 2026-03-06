require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 8123;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// SESSION MIDDLEWARE
// ============================================================
app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'compact-goods-receiving-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
}));

// ============================================================
// STATIC FILES
// ============================================================
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/pdf', express.static('pdfs'));

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Attach user + role to request (used after requireAuth)
async function attachUser(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.position, u.role_id, u.is_active,
              r.name as role_name, r.display_name as role_display_name,
              r.can_create_report, r.can_view_all_reports, r.can_delete_report,
              r.can_manage_users, r.can_manage_roles
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = true`,
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      req.session.destroy();
      return res.status(401).json({ error: 'บัญชีถูกปิดใช้งาน' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function requirePerm(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user[permission]) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    }
    next();
  };
}

// Combine auth + user attachment
const auth = [requireAuth, attachUser];

// ============================================================
// ACTIVITY LOG HELPER
// ============================================================
async function logActivity(userId, action, targetType, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO activity_log (user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)`,
      [userId, action, targetType || null, targetId || null, JSON.stringify(details || {})]
    );
  } catch (e) { console.warn('Activity log failed:', e.message); }
}

// ============================================================
// AUTH ROUTES (public)
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    const result = await pool.query(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1 AND u.is_active = true`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    req.session.userId = user.id;
    await logActivity(user.id, 'login', 'user', user.id, { username: user.username });
    res.json({
      success: true,
      user: {
        id: user.id, username: user.username,
        first_name: user.first_name, last_name: user.last_name,
        position: user.position, role_name: user.role_name,
        role_display_name: user.role_display_name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', ...auth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, username: u.username,
    first_name: u.first_name, last_name: u.last_name,
    position: u.position, role_id: u.role_id,
    role_name: u.role_name, role_display_name: u.role_display_name,
    permissions: {
      can_create_report: u.can_create_report,
      can_view_all_reports: u.can_view_all_reports,
      can_delete_report: u.can_delete_report,
      can_manage_users: u.can_manage_users,
      can_manage_roles: u.can_manage_roles,
    },
  });
});

// ============================================================
// USER MANAGEMENT ROUTES
// ============================================================
app.get('/api/users', ...auth, requirePerm('can_manage_users'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.position, u.role_id, u.is_active, u.created_at,
              r.name as role_name, r.display_name as role_display_name
       FROM users u JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', ...auth, requirePerm('can_manage_users'), async (req, res) => {
  try {
    const { username, password, first_name, last_name, position, role_id } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, first_name, last_name, position, role_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [username, hash, first_name || '', last_name || '', position || '', role_id]
    );
    await logActivity(req.user.id, 'create_user', 'user', result.rows[0].id, { username });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', ...auth, requirePerm('can_manage_users'), async (req, res) => {
  try {
    const { first_name, last_name, position, role_id, password, is_active } = req.body;
    const userId = parseInt(req.params.id);

    // Build dynamic update
    const sets = [];
    const vals = [];
    let idx = 1;
    if (first_name !== undefined) { sets.push(`first_name = $${idx++}`); vals.push(first_name); }
    if (last_name !== undefined) { sets.push(`last_name = $${idx++}`); vals.push(last_name); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); vals.push(position); }
    if (role_id !== undefined) { sets.push(`role_id = $${idx++}`); vals.push(role_id); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${idx++}`);
      vals.push(hash);
    }
    if (sets.length === 0) return res.json({ success: true });

    vals.push(userId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    await logActivity(req.user.id, 'update_user', 'user', userId, { fields: sets });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', ...auth, requirePerm('can_manage_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // Prevent self-deactivation
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถปิดบัญชีตัวเองได้' });
    }
    await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [userId]);
    await logActivity(req.user.id, 'deactivate_user', 'user', userId, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ROLE MANAGEMENT ROUTES
// ============================================================
app.get('/api/roles', ...auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM roles ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', ...auth, requirePerm('can_manage_roles'), async (req, res) => {
  try {
    const { name, display_name, can_create_report, can_view_all_reports, can_delete_report, can_manage_users, can_manage_roles } = req.body;
    if (!name || !display_name) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อบทบาท' });
    }
    const result = await pool.query(
      `INSERT INTO roles (name, display_name, can_create_report, can_view_all_reports, can_delete_report, can_manage_users, can_manage_roles)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, display_name, !!can_create_report, !!can_view_all_reports, !!can_delete_report, !!can_manage_users, !!can_manage_roles]
    );
    await logActivity(req.user.id, 'create_role', 'role', result.rows[0].id, { name });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'ชื่อบทบาทนี้ถูกใช้แล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id', ...auth, requirePerm('can_manage_roles'), async (req, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const { display_name, can_create_report, can_view_all_reports, can_delete_report, can_manage_users, can_manage_roles } = req.body;

    await pool.query(
      `UPDATE roles SET display_name=$1, can_create_report=$2, can_view_all_reports=$3,
       can_delete_report=$4, can_manage_users=$5, can_manage_roles=$6
       WHERE id=$7`,
      [display_name, !!can_create_report, !!can_view_all_reports, !!can_delete_report, !!can_manage_users, !!can_manage_roles, roleId]
    );
    await logActivity(req.user.id, 'update_role', 'role', roleId, { display_name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ACTIVITY LOG
// ============================================================
app.get('/api/activity', ...auth, requirePerm('can_manage_users'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.username, u.first_name, u.last_name
       FROM activity_log a LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MULTER CONFIG
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const photoFields = [];
for (let p = 1; p <= 5; p++) {
  for (let i = 0; i < 4; i++) {
    photoFields.push({ name: `page${p}_photo_${i}`, maxCount: 1 });
  }
}
photoFields.push({ name: 'signature', maxCount: 1 });

// ============================================================
// REPORT ROUTES (protected)
// ============================================================
app.post('/api/submit', ...auth, upload.fields(photoFields), async (req, res) => {
  try {
    const {
      product_type, received_date, company_name, invoice_no, po_no,
      pdc_numbers, comment_thai, comment_english,
      recorder_name, recorder_position, signature_data,
    } = req.body;

    const pdcArray = pdc_numbers ? JSON.parse(pdc_numbers) : [];

    const photos = {};
    for (const field of photoFields) {
      if (req.files[field.name] && req.files[field.name][0]) {
        photos[field.name] = req.files[field.name][0].filename;
      }
    }

    let signatureFile = photos.signature || null;
    if (!signatureFile && signature_data) {
      const sigBuffer = Buffer.from(
        signature_data.replace(/^data:image\/\w+;base64,/, ''), 'base64'
      );
      signatureFile = `sig_${uuidv4()}.png`;
      fs.writeFileSync(path.join(__dirname, 'uploads', signatureFile), sigBuffer);
    }

    const pdfFilename = `report_${uuidv4()}.pdf`;
    const pdfPath = path.join(__dirname, 'pdfs', pdfFilename);

    await generatePDF({
      product_type, received_date, company_name, invoice_no, po_no,
      pdcArray, comment_thai, comment_english,
      recorder_name, recorder_position, photos, signatureFile, pdfPath,
    });

    let dbId = null;
    try {
      const result = await pool.query(
        `INSERT INTO goods_receiving_reports
         (invoice_no, po_no, pdc_numbers, product_type, received_date,
          company_name, comment_thai, comment_english,
          recorder_name, recorder_position, pdf_path, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          invoice_no, po_no, JSON.stringify(pdcArray), product_type,
          received_date || null, company_name,
          comment_thai, comment_english,
          recorder_name, recorder_position, pdfFilename, req.user.id,
        ]
      );
      dbId = result.rows[0].id;
      await logActivity(req.user.id, 'create_report', 'report', dbId, { invoice_no });
    } catch (dbErr) {
      console.warn('DB save failed (PDF still generated):', dbErr.message);
    }

    res.json({ success: true, id: dbId, pdf_url: `/pdf/${pdfFilename}`, pdf_filename: pdfFilename });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports', ...auth, async (req, res) => {
  try {
    const { search, date_from, date_to } = req.query;
    let query = `SELECT g.id, g.invoice_no, g.po_no, g.product_type, g.received_date,
                        g.company_name, g.recorder_name, g.recorded_at, g.pdf_path, g.created_by,
                        u.username as creator_username, u.first_name as creator_first_name, u.last_name as creator_last_name
                 FROM goods_receiving_reports g
                 LEFT JOIN users u ON g.created_by = u.id`;
    const conditions = [];
    const params = [];
    let idx = 1;

    // If user can't view all, only show their own
    if (!req.user.can_view_all_reports) {
      conditions.push(`g.created_by = $${idx++}`);
      params.push(req.user.id);
    }

    // Search filter
    if (search) {
      conditions.push(`(g.invoice_no ILIKE $${idx} OR g.company_name ILIKE $${idx} OR g.po_no ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    // Date range filter
    if (date_from) {
      conditions.push(`g.received_date >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`g.received_date <= $${idx++}`);
      params.push(date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY g.recorded_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    // Fallback: list PDF files from disk
    try {
      const pdfDir = path.join(__dirname, 'pdfs');
      if (!fs.existsSync(pdfDir)) return res.json([]);
      const files = fs.readdirSync(pdfDir)
        .filter(f => f.endsWith('.pdf'))
        .map(f => {
          const stat = fs.statSync(path.join(pdfDir, f));
          return { pdf_path: f, recorded_at: stat.mtime.toISOString(), invoice_no: f.replace('report_', '').replace('.pdf', '') };
        })
        .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
      res.json(files);
    } catch (fsErr) {
      res.json([]);
    }
  }
});

app.get('/api/reports/stats', ...auth, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM goods_receiving_reports`);
    const monthResult = await pool.query(`SELECT COUNT(*) as count FROM goods_receiving_reports WHERE recorded_at >= $1`, [monthStart]);
    const myResult = await pool.query(`SELECT COUNT(*) as count FROM goods_receiving_reports WHERE created_by = $1`, [req.user.id]);

    res.json({
      total: parseInt(totalResult.rows[0].count),
      this_month: parseInt(monthResult.rows[0].count),
      my_reports: parseInt(myResult.rows[0].count),
    });
  } catch (err) {
    res.json({ total: 0, this_month: 0, my_reports: 0 });
  }
});

app.delete('/api/reports/:id', ...auth, requirePerm('can_delete_report'), async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);
    // Get PDF path before deleting
    const report = await pool.query(`SELECT pdf_path FROM goods_receiving_reports WHERE id = $1`, [reportId]);
    if (report.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบเอกสาร' });
    }
    // Delete PDF file
    const pdfFile = path.join(__dirname, 'pdfs', report.rows[0].pdf_path);
    if (fs.existsSync(pdfFile)) {
      fs.unlinkSync(pdfFile);
    }
    // Delete from DB
    await pool.query(`DELETE FROM goods_receiving_reports WHERE id = $1`, [reportId]);
    await logActivity(req.user.id, 'delete_report', 'report', reportId, { pdf_path: report.rows[0].pdf_path });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PDF GENERATION
// ============================================================
function fileToBase64(filePath) {
  try {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (!fs.existsSync(absPath)) return '';
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

async function generatePDF(data) {
  const templatePath = path.join(__dirname, 'templates', 'pdf-template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const uploadsDir = path.join(__dirname, 'uploads');
  const logoB64 = fileToBase64(path.join(__dirname, 'public', 'icons', 'logo.png'));

  let displayDate = '';
  let thaiDate = { day: '', month: '', year: '' };
  if (data.received_date) {
    const d = new Date(data.received_date);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const yearCE = d.getFullYear();
    const yearBE = yearCE + 543;
    displayDate = `${day}/${month}/${yearCE}`;
    thaiDate = { day: String(day), month: String(month), year: String(yearBE) };
  }

  const imgTag = (field, style = '') => {
    if (!data.photos[field]) return '';
    const b64 = fileToBase64(path.join(uploadsDir, data.photos[field]));
    if (!b64) return '';
    return `<img src="${b64}" style="${style}" />`;
  };

  const buildPhotos = (pageNum) => {
    const imgs = [];
    for (let i = 0; i < 4; i++) {
      const tag = imgTag(`page${pageNum}_photo_${i}`, 'max-width:48%;max-height:220px;object-fit:contain;');
      if (tag) imgs.push(tag);
    }
    return imgs.join('');
  };

  const sigB64 = data.signatureFile ? fileToBase64(path.join(uploadsDir, data.signatureFile)) : '';
  const sigImg = sigB64 ? `<img src="${sigB64}" style="max-height:60px;" />` : '';

  const pdcHtml = (data.pdcArray || [])
    .map((p) => `<div style="font-weight:700;font-size:11pt;">${p}</div>`)
    .join('');

  const replacements = {
    '{{LOGO_B64}}': logoB64,
    '{{PRODUCT_TYPE}}': data.product_type || '',
    '{{RECEIVED_DATE}}': displayDate,
    '{{COMPANY_NAME}}': data.company_name || '',
    '{{INVOICE_NO}}': data.invoice_no || '',
    '{{PO_NO}}': data.po_no || '',
    '{{PDC_NUMBERS}}': pdcHtml,
    '{{COMMENT_THAI}}': data.comment_thai || '',
    '{{COMMENT_ENGLISH}}': data.comment_english || '',
    '{{RECORDER_NAME}}': data.recorder_name || '',
    '{{RECORDER_POSITION}}': data.recorder_position || '',
    '{{THAI_DAY}}': thaiDate.day,
    '{{THAI_MONTH}}': thaiDate.month,
    '{{THAI_YEAR}}': thaiDate.year,
    '{{SIGNATURE_IMG}}': sigImg,
    '{{PAGE1_PHOTOS}}': buildPhotos(1),
    '{{PAGE2_PHOTOS}}': buildPhotos(2),
    '{{PAGE3_PHOTOS}}': buildPhotos(3),
    '{{PAGE4_PHOTOS}}': buildPhotos(4),
    '{{PAGE5_PHOTOS}}': buildPhotos(5),
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.pdf({
    path: data.pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
  });
  await browser.close();
}

// Ensure pdfs directory exists
const pdfsDir = path.join(__dirname, 'pdfs');
if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Access from mobile: http://192.168.x.x:${PORT}`);
});

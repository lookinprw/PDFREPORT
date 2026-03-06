const pool = require('./db');
const bcrypt = require('bcryptjs');

async function setup() {
  try {
    // Roles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        can_create_report BOOLEAN DEFAULT false,
        can_view_all_reports BOOLEAN DEFAULT false,
        can_delete_report BOOLEAN DEFAULT false,
        can_manage_users BOOLEAN DEFAULT false,
        can_manage_roles BOOLEAN DEFAULT false,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL DEFAULT '',
        last_name VARCHAR(100) NOT NULL DEFAULT '',
        position VARCHAR(255) DEFAULT '',
        role_id INTEGER REFERENCES roles(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Session table for connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Activity log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        target_type VARCHAR(50),
        target_id INTEGER,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Original reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goods_receiving_reports (
        id SERIAL PRIMARY KEY,
        invoice_no VARCHAR(100),
        po_no VARCHAR(100),
        pdc_numbers JSONB DEFAULT '[]',
        product_type VARCHAR(255),
        received_date DATE,
        company_name VARCHAR(255),
        comment_thai TEXT,
        comment_english TEXT,
        recorder_name VARCHAR(255),
        recorder_position VARCHAR(255),
        recorded_at TIMESTAMP DEFAULT NOW(),
        pdf_path VARCHAR(500),
        created_by INTEGER REFERENCES users(id)
      );
    `);

    // Add created_by column if table already exists without it
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'goods_receiving_reports' AND column_name = 'created_by'
        ) THEN
          ALTER TABLE goods_receiving_reports ADD COLUMN created_by INTEGER REFERENCES users(id);
        END IF;
      END $$;
    `);

    // Seed default roles (upsert)
    await pool.query(`
      INSERT INTO roles (name, display_name, can_create_report, can_view_all_reports, can_delete_report, can_manage_users, can_manage_roles, is_system)
      VALUES
        ('admin', 'ผู้ดูแลระบบ', true, true, true, true, true, true),
        ('store_leader', 'หัวหน้าคลัง', true, true, true, false, false, false),
        ('store', 'เจ้าหน้าที่คลัง', true, false, false, false, false, false)
      ON CONFLICT (name) DO NOTHING;
    `);

    // Seed default admin user
    const adminExists = await pool.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      const adminRole = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
      await pool.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, position, role_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['admin', hash, 'Admin', 'System', 'ผู้ดูแลระบบ', adminRole.rows[0].id]
      );
      console.log('Default admin user created (admin / admin123)');
    }

    console.log('Database setup completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  }
}

setup();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'goods_receiving',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'admin123',
});

module.exports = pool;

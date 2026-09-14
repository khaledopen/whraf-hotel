import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD ?? ''),
  database: process.env.DB_NAME || 'wharf_hotel',
  max: 10
});

function formatPgQuery(sql, params = []) {
  let paramIndex = 1;
  let formattedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  
  const isInsert = /^\s*INSERT\s+INTO/i.test(formattedSql);
  if (isInsert && !/RETURNING/i.test(formattedSql) && !/ON CONFLICT/i.test(formattedSql)) {
    formattedSql += ' RETURNING id';
  }
  return { sql: formattedSql, params };
}

function processPgResult(res) {
  const rows = res.rows || [];
  const resultHeader = {
    affectedRows: res.rowCount || 0,
    insertId: rows[0]?.id !== undefined ? Number(rows[0].id) : null
  };
  return [rows, resultHeader];
}

export const db = {
  async query(sql, params = []) {
    const { sql: formattedSql, params: formattedParams } = formatPgQuery(sql, params);
    const res = await pool.query(formattedSql, formattedParams);
    return processPgResult(res);
  },

  async execute(sql, params = []) {
    return this.query(sql, params);
  },

  async getConnection() {
    const client = await pool.connect();
    return {
      async beginTransaction() {
        await client.query('BEGIN');
      },
      async execute(sql, params = []) {
        const { sql: formattedSql, params: formattedParams } = formatPgQuery(sql, params);
        const res = await client.query(formattedSql, formattedParams);
        return processPgResult(res);
      },
      async query(sql, params = []) {
        return this.execute(sql, params);
      },
      async commit() {
        await client.query('COMMIT');
      },
      async rollback() {
        await client.query('ROLLBACK');
      },
      release() {
        client.release();
      }
    };
  },

  async end() {
    await pool.end();
  }
};

export const demo = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
export const visibility = demo ? '(is_demo = TRUE OR (status = \'published\' AND validated = TRUE))' : "(status = 'published' AND validated = TRUE AND is_demo = FALSE)";


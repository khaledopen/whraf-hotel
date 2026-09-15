import pg from 'pg';
export const pgTypes = {
  getTypeParser(oid, format) {
    if (oid === 1082) return value => value;
    if (oid === 20) return value => Number.isSafeInteger(Number(value)) ? Number(value) : value;
    return pg.types.getTypeParser(oid, format);
  }
};
export const pool = new pg.Pool({
  ...(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {
    host:process.env.DB_HOST || '127.0.0.1', port:Number(process.env.DB_PORT || 5432),
    user:process.env.DB_USER || 'postgres', password:String(process.env.DB_PASSWORD ?? ''),
    database:process.env.DB_NAME || 'wharf_hotel'
  }),
  ...(process.env.DATABASE_URL || process.env.DB_SSL === 'true' ? {ssl:{rejectUnauthorized:false}} : {}),
  max:10, connectionTimeoutMillis:5000, idleTimeoutMillis:30000,
  statement_timeout:10000, query_timeout:15000, types:pgTypes
});
pool.on('error', () => console.error('PostgreSQL : connexion inactive interrompue.'));
// Keep the application's result interface, but never rewrite SQL or invent RETURNING id.
export function createDatabase(connectionPool) {
  function wrap(connection) {
    return {
      async query(sql, params=[]) {
        const result = await connection.query(sql, params);
        if (Array.isArray(result)) return result;
        const header = {affectedRows:result.rowCount || 0, insertId:result.rows[0]?.id ?? null};
        return result.command === 'SELECT' ? [result.rows,header] : [header,result.rows];
      },
      async execute(sql,params=[]) { return this.query(sql,params); }
    };
  }
  return {
    ...wrap(connectionPool),
    async getConnection() {
      const client=await connectionPool.connect();
      return {...wrap(client), beginTransaction:()=>client.query('BEGIN'),
        commit:()=>client.query('COMMIT'), rollback:()=>client.query('ROLLBACK'), release:()=>client.release()};
    },
    end:()=>connectionPool.end()
  };
}
export const db=createDatabase(pool);
export const demo=process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
export const visibility=demo ? "(is_demo=TRUE OR (status='published' AND validated=TRUE))" : "(status='published' AND validated=TRUE AND is_demo=FALSE)";


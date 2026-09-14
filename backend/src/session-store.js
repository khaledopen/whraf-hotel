import session from 'express-session';

// Express session store using the same maintained mysql2 pool as the API.
export class MySQLSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
    this.cleanup = setInterval(() => {
      database.execute('DELETE FROM sessions WHERE expires <= ?', [Date.now()]).catch(() => {});
    }, 15 * 60 * 1000);
    this.cleanup.unref();
  }

  get(id, callback) {
    this.database.execute('SELECT data FROM sessions WHERE session_id = ? AND expires > ?', [id, Date.now()])
      .then(([rows]) => callback(null, rows[0] ? JSON.parse(rows[0].data) : null))
      .catch(callback);
  }

  set(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 3600000;
    this.database.execute('INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?) ON CONFLICT (session_id) DO UPDATE SET expires = EXCLUDED.expires, data = EXCLUDED.data', [id, expires, JSON.stringify(value)])
      .then(() => callback(null)).catch(callback);
  }

  touch(id, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 3600000;
    this.database.execute('UPDATE sessions SET expires = ? WHERE session_id = ?', [expires, id])
      .then(() => callback(null)).catch(callback);
  }

  destroy(id, callback = () => {}) {
    this.database.execute('DELETE FROM sessions WHERE session_id = ?', [id])
      .then(() => callback(null)).catch(callback);
  }

  close() { clearInterval(this.cleanup); }
}

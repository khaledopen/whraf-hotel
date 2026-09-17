import { createApp } from '../backend/src/app.js';
import { db } from '../backend/src/db.js';
import { PostgreSQLSessionStore } from '../backend/src/session-store.js';
import { createNotificationWorker } from '../backend/src/notification-worker.js';

const sessionStore = new PostgreSQLSessionStore(db);

const worker = createNotificationWorker({ database: db });
const app = createApp({ sessionStore, drainNotifications: () => worker.drain(1), deliverReply: id => worker.processReply(id), deliverNotification: (type,id,kind) => worker.processRequest(type,id,kind) });

export default function handler(req, res) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  return app(req, res);
}

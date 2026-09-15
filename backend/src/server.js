import {PostgreSQLSessionStore} from './session-store.js';
import {db} from './db.js';
import {createApp} from './app.js';
import {createNotificationWorker} from './notification-worker.js';
// Fail before accepting requests if the additive migration has not been applied.
await db.query('SELECT id FROM notification_jobs LIMIT 0');
const store=new PostgreSQLSessionStore(db);
const worker=createNotificationWorker({database:db});
const app=createApp({sessionStore:store});
const server=app.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>{
  console.log(`Wharf Hôtel : http://127.0.0.1:${process.env.PORT||3001}`);
  if(process.env.NOTIFICATIONS_ENABLED!=='false') worker.start();
});
let closing=false;
async function shutdown(){if(closing)return;closing=true;server.close(async()=>{await worker.stop();store.close();await db.end();});}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);

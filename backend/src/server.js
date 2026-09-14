import {MySQLSessionStore} from './session-store.js';
import {db} from './db.js';
import {createApp} from './app.js';
const store=new MySQLSessionStore(db);
const app=createApp({sessionStore:store});
const server=app.listen(Number(process.env.PORT||3001),'127.0.0.1',()=>console.log('Wharf Hôtel : http://127.0.0.1:3001'));
process.on('SIGTERM',()=>server.close(async()=>{await store.close();await db.end();}));

import {createHash,randomUUID} from 'node:crypto';
import {enqueueNotification,requestTables} from './notifications.js';
import {visibility} from './db.js';

export function httpError(status,message,fields) {
  return Object.assign(Error(message),{status,fields});
}
export async function submitRequest(database,type,data,key=randomUUID()) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))
    throw httpError(400,'Identifiant de demande invalide. Rechargez la page.');
  const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const conn=await database.getConnection();
  try {
    await conn.beginTransaction();
    // Serialize retries of the same submission, including simultaneous requests.
    await conn.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key.toLowerCase()]);
    const [previous]=await conn.query('SELECT * FROM form_submissions WHERE submission_key=$1',[key]);
    if(previous[0]) {
      if(previous[0].payload_hash!==hash || previous[0].request_type!==type)
        throw httpError(409,'Cette demande a déjà été envoyée avec un contenu différent. Rechargez la page pour en créer une nouvelle.');
      await conn.commit();return {id:previous[0].request_id,replayed:true};
    }
    if(type==='reservations' && data.room_type_id) {
      const [rooms]=await conn.query(`SELECT capacity FROM room_types WHERE id=$1 AND ${visibility}`,[data.room_type_id]);
      if(!rooms.length) throw httpError(422,'Catégorie indisponible.',{room_type_id:'Choisissez une catégorie publiée.'});
      if(rooms[0].capacity && data.adults+data.children>rooms[0].capacity)
        throw httpError(422,'Capacité dépassée.',{adults:'Le nombre de voyageurs dépasse la capacité de cette chambre.'});
    }
    const keys=Object.keys(data);
    const [result]=await conn.execute(`INSERT INTO ${requestTables[type]} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING id`,Object.values(data));
    await conn.execute('INSERT INTO form_submissions(submission_key,request_type,request_id,payload_hash) VALUES ($1,$2,$3,$4)',[key,type,result.insertId,hash]);
    await enqueueNotification(conn,type,result.insertId,'reception');
    await conn.commit();return {id:result.insertId,replayed:false};
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}

export async function updateRequest(database,type,id,data) {
  const conn=await database.getConnection();
  try {
    await conn.beginTransaction();
    const [previous]=await conn.query(`SELECT status FROM ${requestTables[type]} WHERE id=$1 FOR UPDATE`,[id]);
    if(!previous[0]) throw httpError(404,'Demande introuvable.');
    await conn.execute(`UPDATE ${requestTables[type]} SET status=$1,internal_notes=$2,updated_at=NOW() WHERE id=$3`,[data.status,data.internal_notes,id]);
    if(data.status==='confirmed' && previous[0].status!=='confirmed' && type!=='contacts') {
      await enqueueNotification(conn,type,id,'confirmation');
      await conn.execute("UPDATE notification_jobs SET state='pending',attempts=0,next_attempt_at=NOW(),updated_at=NOW() WHERE request_type=$1 AND request_id=$2 AND kind='confirmation' AND state='cancelled'",[type,id]);
    } else if(data.status!=='confirmed') {
      await conn.execute("UPDATE notification_jobs SET state='cancelled',updated_at=NOW() WHERE request_type=$1 AND request_id=$2 AND kind='confirmation' AND state IN ('pending','failed','unconfigured')",[type,id]);
    }
    await conn.commit();
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}

export async function retryNotification(database,type,id,kind) {
  if(!['reception','confirmation'].includes(kind)) throw httpError(422,'Type de notification invalide.');
  const conn=await database.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]=await conn.query(`SELECT status FROM ${requestTables[type]} WHERE id=$1 FOR UPDATE`,[id]);
    if(!rows[0]) throw httpError(404,'Demande introuvable.');
    if(kind==='confirmation' && (rows[0].status!=='confirmed' || type==='contacts'))
      throw httpError(409,'Confirmez d’abord la demande avant de relancer cet e-mail.');
    const [r]=await conn.execute(`UPDATE notification_jobs SET state='pending',attempts=0,last_error=NULL,next_attempt_at=NOW(),updated_at=NOW()
      WHERE request_type=$1 AND request_id=$2 AND kind=$3 AND state IN ('failed','unconfigured')`,[type,id,kind]);
    if(!r.affectedRows) throw httpError(409,'Cet e-mail est déjà envoyé, en cours, ou ne peut pas être relancé.');
    if(kind==='reception') await conn.execute(`UPDATE ${requestTables[type]} SET notification_status='pending' WHERE id=$1`,[id]);
    await conn.commit();
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}

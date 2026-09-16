import {httpError} from './requests.js';
export function registerContactReplyRoutes(app,database,deliverReply){
  const deliver=async id=>{if(deliverReply)try{await deliverReply(id);}catch{console.error('Réponse enregistrée : envoi différé.');}};
  app.get('/api/admin/contacts/:id/replies',async(req,res)=>res.json(await listContactReplies(database,req.params.id)));
  app.post('/api/admin/contacts/:id/replies',async(req,res)=>{
    const result=await queueContactReply(database,req.params.id,req.body,req.get('Idempotency-Key'));
    await deliver(result.id);res.status(result.replayed?200:202).json({...result,message:'Réponse enregistrée. Consultez le suivi d’envoi.'});
  });
  app.post('/api/admin/contacts/:id/replies/:replyId/retry',async(req,res)=>{
    if(!/^[1-9]\d*$/.test(req.params.replyId))throw httpError(400,'Réponse invalide.');
    await retryContactReply(database,req.params.id,req.params.replyId);await deliver(req.params.replyId);res.json({ok:true});
  });
}
export async function queueContactReply(database,id,input,key){
  const body=typeof input?.body==='string'?input.body.trim():'';
  if(!body||body.length>10000)throw httpError(422,'Rédigez une réponse de 1 à 10 000 caractères.');
  if(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))throw httpError(422,'Identifiant d’envoi invalide.');
  const conn=await database.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
    const [previous]=await conn.query('SELECT * FROM contact_replies WHERE submission_key=$1',[key]);
    if(previous.length){
      if(previous[0].contact_id!==Number(id)||previous[0].body!==body)throw httpError(409,'Cette clé correspond à une autre réponse.');
      await conn.commit();return {id:previous[0].id,replayed:true};
    }
    const [contacts]=await conn.query('SELECT * FROM contact_messages WHERE id=$1 FOR UPDATE',[id]);
    if(!contacts.length)throw httpError(404,'Message introuvable.');
    const contact=contacts[0];
    const [saved]=await conn.execute('INSERT INTO contact_replies(contact_id,submission_key,body,recipient,subject) VALUES ($1,$2,$3,$4,$5) RETURNING id',[id,key,body,contact.email,('Re: '+contact.subject).replace(/[\r\n]/g,' ').slice(0,250)]);
    await conn.execute("INSERT INTO notification_jobs(request_type,request_id,kind) VALUES ('contacts',$1,'reply')",[saved.insertId]);
    await conn.execute("UPDATE contact_messages SET status='processing',updated_at=NOW() WHERE id=$1",[id]);
    await conn.commit();return {id:saved.insertId,replayed:false};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function listContactReplies(database,id){
  const [rows]=await database.query(`SELECT r.id,r.body,r.recipient,r.subject,r.created_at,n.state,n.last_error,n.attempts,n.sent_at
    FROM contact_replies r JOIN notification_jobs n ON n.kind='reply' AND n.request_type='contacts' AND n.request_id=r.id
    WHERE r.contact_id=$1 ORDER BY r.id`,[id]);
  return rows;
}
export async function retryContactReply(database,contactId,replyId){
  const [result]=await database.execute(`UPDATE notification_jobs n SET state='pending',attempts=0,last_error=NULL,next_attempt_at=NOW(),updated_at=NOW()
    FROM contact_replies r WHERE r.id=$1 AND r.contact_id=$2 AND n.request_id=r.id AND n.request_type='contacts' AND n.kind='reply'
    AND n.state IN ('failed','unconfigured')`,[replyId,contactId]);
  if(!result.affectedRows)throw httpError(409,'Cette réponse est déjà envoyée, en cours, ou introuvable.');
}

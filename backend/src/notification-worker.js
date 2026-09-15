import {randomUUID} from 'node:crypto';
import {buildMessage,createMailTransport,mailError,requestTables} from './notifications.js';

export function createNotificationWorker({database,transport=createMailTransport(),env=process.env,intervalMs=5000}) {
  let timer,active,stopped=false;
  async function processOne() {
    const token=randomUUID();
    const [,jobs]=await database.execute(`UPDATE notification_jobs SET state='sending',
      attempts=attempts+1,locked_at=NOW(),claim_token=$1,updated_at=NOW()
      WHERE id=(SELECT id FROM notification_jobs WHERE
        ((state IN ('pending','failed','unconfigured') AND next_attempt_at<=NOW() AND attempts<5)
          OR (state='sending' AND locked_at<NOW()-INTERVAL '2 minutes'))
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[token]);
    const job=jobs[0];
    if(!job) return false;
    let state='sent',error=null;
    try {
      const message=await buildMessage(job,database,env);
      if(!message) state='cancelled';
      else if(!transport) state='unconfigured';
      else {
        const result=await transport.sendMail(message);
        if(result?.rejected?.length || (Array.isArray(result?.accepted) && !result.accepted.length))
          throw Object.assign(Error('Recipient rejected'),{code:'EENVELOPE'});
      }
    } catch(failure) {state='failed';error=mailError(failure);}
    const delay=state==='unconfigured'?300:Math.min(3600,60*2**Math.min(job.attempts-1,6));
    const conn=await database.getConnection();
    try {
      await conn.beginTransaction();
      const [updated]=await conn.execute(`UPDATE notification_jobs SET state=$1::varchar,last_error=$2,
        next_attempt_at=NOW()+($3 * INTERVAL '1 second'),locked_at=NULL,claim_token=NULL,
        attempts=attempts-$4,sent_at=CASE WHEN $1::varchar='sent' THEN NOW() ELSE sent_at END,updated_at=NOW()
        WHERE id=$5 AND claim_token=$6`,[state,error,delay,state==='unconfigured'?1:0,job.id,token]);
      if(updated.affectedRows && job.kind==='reception' && state!=='cancelled')
        await conn.execute(`UPDATE ${requestTables[job.request_type]} SET notification_status=$1 WHERE id=$2`,[state,job.request_id]);
      await conn.commit();
    } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
    return true;
  }
  async function drain() {
    if(active || stopped) return active;
    active=(async()=>{for(let n=0;n<10&&!stopped;n++) if(!await processOne()) break;})();
    try {await active;} finally {active=null;}
  }
  return {
    processOne,drain,
    start() {
      const tick=()=>drain().catch(()=>console.error('Notifications : traitement différé, nouvelle tentative au prochain passage.'));
      stopped=false;tick();timer=setInterval(tick,intervalMs);timer.unref();
    },
    async stop() {stopped=true;clearInterval(timer);await active;transport?.close?.();}
  };
}

import nodemailer from 'nodemailer';
export const requestTables={reservations:'reservation_requests',events:'event_requests',contacts:'contact_messages'};
export function smtpConfiguration(env=process.env) {
  const missing=['SMTP_HOST','SMTP_FROM','NOTIFICATION_EMAIL'].filter(key=>!env[key]?.trim());
  if(env.SMTP_USER && !(env.SMTP_PASSWORD || env.SMTP_PASS)) missing.push('SMTP_PASSWORD');
  return {configured:missing.length===0,missing};
}
export function createMailTransport(env=process.env) {
  if(!smtpConfiguration(env).configured) return null;
  return nodemailer.createTransport({
    host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_SECURE==='true',
    auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD||env.SMTP_PASS}:undefined,
    connectionTimeout:5000,greetingTimeout:5000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true
  });
}
export function mailError(error) {
  const codes={EAUTH:'Authentification SMTP refusée',ECONNECTION:'Connexion SMTP impossible',
    ECONNREFUSED:'Connexion SMTP refusée',ETIMEDOUT:'Délai SMTP dépassé',
    ESOCKET:'Connexion SMTP interrompue',EDNS:'Serveur SMTP introuvable',
    EENVELOPE:'Expéditeur ou destinataire refusé',EMESSAGE:'Message refusé',EPROTOCOL:'Serveur SMTP temporairement indisponible'};
  return codes[error?.code] || 'Échec de remise au serveur SMTP';
}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(String(date))?String(date).split('-').reverse().join('/'):'À préciser';
export async function buildMessage(job,database,env=process.env) {
  const table=requestTables[job.request_type];
  if(!table) throw Error('Type de demande inconnu.');
  const [rows]=await database.query(`SELECT * FROM ${table} WHERE id=$1`,[job.request_id]);
  const data=rows[0];
  if(!data || (job.kind==='confirmation' && data.status!=='confirmed')) return null;
  const label={reservations:'réservation',events:'événement',contacts:'contact'}[job.request_type];
  let text,subject;
  if(job.kind==='reception') {
    subject=`Wharf Hôtel — nouvelle demande de ${label} #${data.id}`;
    text=`Une demande de ${label} a été enregistrée sous le numéro ${data.id}.\nConsultez l’administration pour la traiter. La réception ne confirme pas un séjour.`;
  } else {
    if(job.request_type==='contacts') return null;
    subject=`Wharf Hôtel — confirmation de votre ${label} #${data.id}`;
    text=`Bonjour ${data.name},\n\nL’hôtel a confirmé votre demande de ${label} #${data.id}.\n\n`;
    if(job.request_type==='reservations') {
      text+=`Arrivée : ${formatDate(data.arrival)}\nDépart : ${formatDate(data.departure)}\nVoyageurs : ${data.adults} adulte(s), ${data.children} enfant(s)\n`;
      if(data.room_type_id) {
        const [rooms]=await database.query('SELECT name FROM room_types WHERE id=$1',[data.room_type_id]);
        if(rooms[0]) text+=`Chambre : ${rooms[0].name}\n`;
      }
    } else text+=`Événement : ${data.event_type}\nDate : ${formatDate(data.event_date)}\nParticipants : ${data.participants}\n`;
    const [settings]=await database.query("SELECT setting_key,value FROM hotel_settings WHERE validated=TRUE AND setting_key IN ('phone','email','address')");
    text+='\nPour toute précision, contactez l’hôtel.\n'+settings.map(s=>s.value).join('\n')+'\n\nÀ bientôt au Wharf Hôtel.';
  }
  return {
    from:env.SMTP_FROM,to:job.kind==='reception'?env.NOTIFICATION_EMAIL:data.email,subject,text,
    html:`<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.7;color:#0b3c5d"><h2>WHARF HÔTEL — GRAND-BASSAM</h2>${escapeHtml(text).replace(/\n/g,'<br>')}</div>`,
    messageId:`<wharf-${job.request_type}-${job.request_id}-${job.kind}-${job.id}@notifications.wharf.local>`
  };
}
export async function enqueueNotification(connection,type,id,kind) {
  await connection.execute('INSERT INTO notification_jobs(request_type,request_id,kind) VALUES ($1,$2,$3) ON CONFLICT(request_type,request_id,kind) DO NOTHING',[type,id,kind]);
}


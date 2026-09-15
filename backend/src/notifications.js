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
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(String(date))?String(date).split('-').reverse().join('/'):'À préciser';

/* ── Shared HTML shell ─────────────────────────────────── */
function htmlShell(title, preheader, bodyHtml) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(title)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
  <tr><td align="center">
    <span style="display:none;max-height:0;overflow:hidden;">${h(preheader)}</span>
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#0b3c5d 0%,#1a6b8a 100%);padding:36px 40px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;color:#a8d8ea;text-transform:uppercase;font-weight:600;">Grand-Bassam · Côte d'Ivoire</p>
        <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:700;letter-spacing:1px;">WHARF HÔTEL</h1>
        <div style="margin:16px auto 0;width:48px;height:2px;background:linear-gradient(90deg,#c9a84c,#f0d080);border-radius:1px;"></div>
      </td></tr>
      <!-- BODY -->
      <tr><td style="padding:40px 40px 32px;">
        ${bodyHtml}
      </td></tr>
      <!-- FOOTER -->
      <tr><td style="background:#f8f9fa;border-top:1px solid #e8ecf0;padding:24px 40px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Boulevard Treich-Laplène, Quartier France, Grand-Bassam</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">📞 +225 27 21 30 15 33 &nbsp;·&nbsp; ✉️ lewharfhotel@gmail.com</p>
        <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Wharf Hôtel · Tous droits réservés</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;white-space:nowrap;vertical-align:top;">${h(label)}</td>
    <td style="padding:10px 16px;font-size:14px;color:#1f2937;border-left:2px solid #e5e7eb;">${h(String(value??'—'))}</td>
  </tr>`;
}

function badge(color, text) {
  return `<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px;background:${color};color:#fff;">${h(text)}</span>`;
}

/* ── Client confirmation emails (per type) ────────────── */
function buildReservationConfirmationHtml(data, roomName) {
  const guests = `${data.adults} adulte${data.adults>1?'s':''}`+(data.children?`, ${data.children} enfant${data.children>1?'s':''}`:'');
  return htmlShell(
    `Confirmation de votre réservation #${data.id}`,
    `Votre séjour au Wharf Hôtel est confirmé ! Arrivée le ${formatDate(data.arrival)}.`,
    `<p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0b3c5d;">Bonjour ${h(data.name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Nous avons le plaisir de vous confirmer votre réservation au <strong>Wharf Hôtel</strong>.<br>
      Nous vous attendons avec impatience et ferons tout notre possible pour rendre votre séjour inoubliable. 🌊
    </p>
    <div style="background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);border-left:4px solid #0b3c5d;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0b3c5d;letter-spacing:1px;text-transform:uppercase;">🛏 Détails de votre séjour</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Numéro de réservation', `#${data.id}`)}
        ${infoRow('Arrivée', formatDate(data.arrival))}
        ${infoRow('Départ', formatDate(data.departure))}
        ${infoRow('Voyageurs', guests)}
        ${roomName ? infoRow('Catégorie', roomName) : ''}
        ${data.message ? infoRow('Votre message', data.message) : ''}
      </table>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;color:#92400e;">
        ℹ️ <strong>Informations pratiques :</strong> Votre chambre sera disponible à partir de 14h le jour d'arrivée. Le départ est avant 12h sauf accord préalable.
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Pour toute question ou demande particulière, n'hésitez pas à nous contacter :<br>
      📞 <strong>+225 27 21 30 15 33</strong> ou ✉️ <strong>lewharfhotel@gmail.com</strong>
    </p>
    <p style="margin:0;font-size:15px;color:#0b3c5d;font-weight:600;font-style:italic;">À très bientôt au Wharf Hôtel ! 🌴</p>`
  );
}

function buildEventConfirmationHtml(data) {
  return htmlShell(
    `Confirmation de votre événement #${data.id}`,
    `Votre événement au Wharf Hôtel est confirmé ! Date : ${formatDate(data.event_date)}.`,
    `<p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0b3c5d;">Bonjour ${h(data.name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Nous sommes ravis de vous confirmer l'organisation de votre événement au <strong>Wharf Hôtel</strong>.<br>
      Notre équipe se mobilisera pour faire de cette journée un moment exceptionnel. 🎉
    </p>
    <div style="background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-left:4px solid #7c3aed;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#7c3aed;letter-spacing:1px;text-transform:uppercase;">🎪 Détails de votre événement</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow('Numéro de demande', `#${data.id}`)}
        ${infoRow('Type d\'événement', data.event_type)}
        ${infoRow('Date', formatDate(data.event_date))}
        ${infoRow('Nombre de participants', `${data.participants} personne${data.participants>1?'s':''}`)}
        ${data.message ? infoRow('Votre message', data.message) : ''}
      </table>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;color:#166534;">
        ✅ <strong>Prochaine étape :</strong> Un membre de notre équipe vous contactera dans les 24h pour finaliser les détails de votre prestation (devis, menu, disposition de salle, etc.).
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Pour toute question, contactez notre responsable événements :<br>
      📞 <strong>+225 27 21 30 15 33</strong> ou ✉️ <strong>lewharfhotel@gmail.com</strong>
    </p>
    <p style="margin:0;font-size:15px;color:#0b3c5d;font-weight:600;font-style:italic;">Merci pour votre confiance — à bientôt au Wharf Hôtel ! 🌊</p>`
  );
}

/* ── Admin reception emails (per type) ───────────────── */
function buildReceptionHtml(type, data, roomName) {
  const typeLabels={reservations:'Réservation',events:'Événement',contacts:'Message de contact'};
  const typeColors={reservations:'#0b3c5d',events:'#7c3aed',contacts:'#0f766e'};
  const typeIcons={reservations:'🛏',events:'🎪',contacts:'✉️'};
  const color=typeColors[type]||'#374151';
  const label=typeLabels[type]||type;
  const icon=typeIcons[type]||'📋';

  let detailsHtml='';
  if(type==='reservations') {
    const guests=`${data.adults} adulte${data.adults>1?'s':''}`+(data.children?`, ${data.children} enfant${data.children>1?'s':''}` :'');
    detailsHtml=`${infoRow('Client',data.name)} ${infoRow('Email',data.email)} ${infoRow('Téléphone',data.phone)} ${infoRow('Arrivée',formatDate(data.arrival))} ${infoRow('Départ',formatDate(data.departure))} ${infoRow('Voyageurs',guests)} ${roomName?infoRow('Catégorie',roomName):''} ${data.message?infoRow('Message',data.message):''}`;
  } else if(type==='events') {
    detailsHtml=`${infoRow('Client',data.name)} ${infoRow('Email',data.email)} ${infoRow('Téléphone',data.phone)} ${infoRow('Type d\'événement',data.event_type)} ${infoRow('Date',formatDate(data.event_date))} ${infoRow('Participants',data.participants)} ${infoRow('Message',data.message)}`;
  } else {
    detailsHtml=`${infoRow('Nom',data.name)} ${infoRow('Email',data.email)} ${infoRow('Sujet',data.subject)} ${infoRow('Message',data.message)}`;
  }

  return htmlShell(
    `${label} #${data.id} — Administration`,
    `Nouvelle demande de ${label.toLowerCase()} reçue de ${data.name}.`,
    `<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0b3c5d;">${icon} Nouvelle demande · ${h(label)}</p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;">
      Une nouvelle demande vient d'être enregistrée sur le site du Wharf Hôtel. Veuillez la traiter depuis votre espace administrateur.
    </p>
    <div style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border-left:4px solid ${h(color)};border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:${h(color)};letter-spacing:1px;text-transform:uppercase;">${icon} Détails de la demande #${data.id}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${detailsHtml}
      </table>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${h(process.env.PUBLIC_ORIGIN||'')}/admin" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${h(color)},#1a6b8a);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:.5px;">
        🔐 Accéder à l'administration
      </a>
    </div>
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Cet email est automatique — ne pas répondre directement.</p>`
  );
}

/* ── Main buildMessage function ───────────────────────── */
export async function buildMessage(job,database,env=process.env) {
  const table=requestTables[job.request_type];
  if(!table) throw Error('Type de demande inconnu.');
  const [rows]=await database.query(`SELECT * FROM ${table} WHERE id=$1`,[job.request_id]);
  const data=rows[0];
  if(!data || (job.kind==='confirmation' && data.status!=='confirmed')) return null;

  let subject,text,html;

  if(job.kind==='reception') {
    // ── Email admin : nouvelle demande
    const labels={reservations:'réservation',events:'événement',contacts:'message de contact'};
    subject=`🏨 Wharf Hôtel — Nouvelle demande de ${labels[job.request_type]||job.request_type} #${data.id}`;
    let roomName=null;
    if(job.request_type==='reservations' && data.room_type_id) {
      const [rooms]=await database.query('SELECT name FROM room_types WHERE id=$1',[data.room_type_id]);
      roomName=rooms[0]?.name||null;
    }
    html=buildReceptionHtml(job.request_type,data,roomName);
    text=`Nouvelle demande #${data.id} de ${data.name} (${data.email}).`;

  } else {
    // ── Email client : confirmation
    if(job.request_type==='contacts') return null; // pas de confirmation email pour les contacts
    let roomName=null;
    if(job.request_type==='reservations') {
      subject=`✅ Wharf Hôtel — Votre réservation #${data.id} est confirmée`;
      if(data.room_type_id) {
        const [rooms]=await database.query('SELECT name FROM room_types WHERE id=$1',[data.room_type_id]);
        roomName=rooms[0]?.name||null;
      }
      html=buildReservationConfirmationHtml(data,roomName);
      text=`Bonjour ${data.name},\n\nVotre réservation #${data.id} est confirmée.\nArrivée : ${formatDate(data.arrival)}\nDépart : ${formatDate(data.departure)}\nVoyageurs : ${data.adults} adulte(s)${data.children?`, ${data.children} enfant(s)`:''}\n${roomName?`Chambre : ${roomName}\n`:''}\nÀ bientôt au Wharf Hôtel !\n+225 27 21 30 15 33 — lewharfhotel@gmail.com`;
    } else {
      subject=`✅ Wharf Hôtel — Votre événement #${data.id} est confirmé`;
      html=buildEventConfirmationHtml(data);
      text=`Bonjour ${data.name},\n\nVotre événement #${data.id} est confirmé.\nType : ${data.event_type}\nDate : ${formatDate(data.event_date)}\nParticipants : ${data.participants}\n\nÀ bientôt au Wharf Hôtel !\n+225 27 21 30 15 33 — lewharfhotel@gmail.com`;
    }
  }

  return {
    from:env.SMTP_FROM,
    to:job.kind==='reception'?env.NOTIFICATION_EMAIL:data.email,
    subject,text,html,
    messageId:`<wharf-${job.request_type}-${job.request_id}-${job.kind}-${job.id}@notifications.wharf.local>`
  };
}

export async function enqueueNotification(connection,type,id,kind) {
  await connection.execute('INSERT INTO notification_jobs(request_type,request_id,kind) VALUES ($1,$2,$3) ON CONFLICT(request_type,request_id,kind) DO NOTHING',[type,id,kind]);
}

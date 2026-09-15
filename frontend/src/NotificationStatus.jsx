import React,{useState,useEffect} from 'react';
import {api} from './api';
const labels={pending:'En attente d’envoi',sending:'Envoi en cours',sent:'Remis au serveur mail',failed:'Échec d’envoi',unconfigured:'Configuration SMTP manquante',cancelled:'Envoi annulé'};
export default function NotificationStatus({row,section,onRefresh}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const jobs=row.notifications||[];
  async function refresh(){try{await onRefresh();}catch(e){setMessage(e.message);}}
  useEffect(()=>{if(!jobs.some(j=>['pending','sending'].includes(j.state)||(j.state==='failed'&&j.attempts<5)))return;const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);return()=>clearInterval(timer);},[row.notifications,onRefresh]);
  async function retry(kind) {
    if(busy)return;setBusy(true);setMessage('');
    try{await api(`/admin/${section}/${row.id}/notifications/${kind}/retry`,{method:'POST'});setMessage('E-mail remis en attente.');await onRefresh();}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  return <div className="notification-status"><h3>Suivi des e-mails</h3>{!jobs.length&&<p>Aucun envoi suivi pour cette ancienne demande.</p>}{jobs.map(job=><div className="notification-item" key={job.kind}><strong>{job.kind==='reception'?'Notification à l’hôtel':'Confirmation au client'}</strong><span>{labels[job.state]||job.state}</span>{job.last_error&&<span className="field-error">{job.last_error}</span>}{job.state==='failed'&&job.attempts<5&&<small>Nouvelle tentative automatique prévue.</small>}{job.state==='failed'&&job.attempts>=5&&<small>Cinq tentatives effectuées. Vérifiez le SMTP avant de relancer.</small>}{['failed','unconfigured'].includes(job.state)&&<button className="secondary" type="button" disabled={busy} onClick={()=>retry(job.kind)}>Relancer cet e-mail</button>}</div>)}{message&&<p role="status">{message}</p>}<button type="button" className="secondary" disabled={busy} onClick={refresh}>Actualiser le suivi</button></div>;
}
export function MailDiagnostic() {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function verify(){setBusy(true);try{const r=await api('/admin/mail-verify',{method:'POST'});setMessage(r.message);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <div className="notice"><p>Les demandes sont enregistrées immédiatement. Les e-mails sont envoyés séparément, avec reprise automatique en cas d’échec.</p><button className="secondary" disabled={busy} onClick={verify}>{busy?'Vérification…':'Vérifier la connexion SMTP'}</button>{message&&<p role="status">{message}</p>}</div>;
}

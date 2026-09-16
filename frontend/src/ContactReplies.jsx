import React,{useState,useEffect,useRef} from 'react';
import {api} from './api';
const labels={pending:'En attente d’envoi',sending:'Envoi en cours',sent:'Envoyée au serveur mail',failed:'Échec d’envoi',unconfigured:'SMTP non configuré',cancelled:'Annulée'};
export default function ContactReplies({contact,onQueued,onDelivered}){
 const [body,setBody]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const submission=useRef(),inFlight=useRef(false),delivered=useRef(new Set()),initialized=useRef(false),callbacks=useRef({onDelivered});
 callbacks.current={onDelivered};
 useEffect(()=>{let active=true;
   async function refresh(){try{const data=await api('/admin/contacts/'+contact.id+'/replies');if(!active)return;setRows(data);for(const r of data.slice(-1))if(r.state==='sent'&&!delivered.current.has(r.id)){delivered.current.add(r.id);if(initialized.current)callbacks.current.onDelivered?.();}initialized.current=true;}catch(e){if(active)setError(e.message);}}
   refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);return()=>{active=false;clearInterval(timer);};
 },[contact.id]);
 async function send(){
   if(inFlight.current)return;
   if(!body.trim()){setError('Rédigez votre réponse.');return;}
   if(submission.current?.body!==body.trim())submission.current={body:body.trim(),key:crypto.randomUUID()};
   inFlight.current=true;setBusy(true);setError('');setNotice('');
   try{await api('/admin/contacts/'+contact.id+'/replies',{method:'POST',body:{body:submission.current.body},headers:{'Idempotency-Key':submission.current.key}});setBody('');submission.current=null;onQueued?.();setNotice('Réponse enregistrée. Le suivi ci-dessous indique son envoi.');const history=await api('/admin/contacts/'+contact.id+'/replies');setRows(history);const last=history.at(-1);if(last?.state==='sent'){delivered.current.add(last.id);onDelivered?.();}}
   catch(e){setError(e.message);}finally{setBusy(false);inFlight.current=false;}
 }
 async function retry(id){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await api('/admin/contacts/'+contact.id+'/replies/'+id+'/retry',{method:'POST'});setRows(await api('/admin/contacts/'+contact.id+'/replies'));setNotice('Envoi relancé.');}catch(e){setError(e.message);}finally{setBusy(false);inFlight.current=false;}}
 return <section className="contact-replies"><h3>Répondre au client</h3><p>Destinataire : <strong>{contact.email}</strong></p><label>Votre réponse par e-mail<textarea rows="7" maxLength="10000" value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="Bonjour…"/></label><button type="button" disabled={busy||!body.trim()} onClick={send}>{busy?'Envoi en cours…':'Envoyer la réponse par e-mail'}</button><p>Le message passe à « Répondu » lorsque le serveur mail accepte votre réponse. Les notes internes ne sont pas envoyées.</p>{error&&<p role="alert" className="field-error">{error}</p>}{notice&&<p role="status">{notice}</p>}<h3>Historique des réponses</h3>{rows.map(r=><article className="reply-history" key={r.id}><strong>{labels[r.state]||r.state}</strong><small>{new Date(r.created_at).toLocaleString('fr-FR')} · {r.recipient}</small><p style={{whiteSpace:'pre-wrap'}}>{r.body}</p>{r.last_error&&<p className="field-error">{r.last_error}</p>}{['failed','unconfigured'].includes(r.state)&&<button className="secondary" type="button" disabled={busy} onClick={()=>retry(r.id)}>Réessayer l’envoi</button>}</article>)}{!rows.length&&<p>Aucune réponse envoyée depuis le site.</p>}</section>;
}

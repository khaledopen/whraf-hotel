import React,{useState,useEffect,useRef} from 'react';
import {api} from './api';
import {mailFeedback} from './mailFeedback';
export default function ContactReplies({contact,onQueued,onDelivered}){
 const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pendingReply=useRef(null);
 function showDelivery(reply){const result=mailFeedback(reply);setNotice(result.error?'':result.message);setError(result.error?result.message:'');}
 const submission=useRef(),inFlight=useRef(false),delivered=useRef(new Set()),initialized=useRef(false),callbacks=useRef({onDelivered});
 callbacks.current={onDelivered};
 useEffect(()=>{let active=true;
   async function refresh(){try{const data=await api('/admin/contacts/'+contact.id+'/replies');if(!active)return;const current=data.find(r=>r.id===pendingReply.current);if(current)showDelivery(current);for(const r of data.slice(-1))if(r.state==='sent'&&!delivered.current.has(r.id)){delivered.current.add(r.id);if(initialized.current)callbacks.current.onDelivered?.();}initialized.current=true;}catch(e){if(active)setError(e.message);}}
   refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);return()=>{active=false;clearInterval(timer);};
 },[contact.id]);
 async function send(){
   if(inFlight.current)return;
   if(!body.trim()){setError('Rédigez votre réponse.');return;}
   if(submission.current?.body!==body.trim())submission.current={body:body.trim(),key:crypto.randomUUID()};
   inFlight.current=true;setBusy(true);setError('');setNotice('');
   try{const result=await api('/admin/contacts/'+contact.id+'/replies',{method:'POST',body:{body:submission.current.body},headers:{'Idempotency-Key':submission.current.key}});pendingReply.current=result.id;setBody('');submission.current=null;onQueued?.();setNotice('Envoi en cours…');const history=await api('/admin/contacts/'+contact.id+'/replies');const last=history.find(r=>r.id===result.id);showDelivery(last);if(last?.state==='sent'){delivered.current.add(last.id);onDelivered?.();}}
   catch(e){setError(e.message);}finally{setBusy(false);inFlight.current=false;}
 }
 return <section className="contact-replies"><h3>Répondre au client</h3><p>Destinataire : <strong>{contact.email}</strong></p><label>Votre réponse par e-mail<textarea rows="7" maxLength="10000" value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="Bonjour…"/></label><button type="button" disabled={busy||!body.trim()} onClick={send}>{busy?'Envoi en cours…':'Envoyer la réponse par e-mail'}</button>{error&&<p role="alert" className="field-error">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}

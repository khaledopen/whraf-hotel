import React,{useState,useEffect,useRef} from 'react';
import {api} from './api';
export default function ContactReplies({contact,onQueued,onDelivered}){
 const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const submission=useRef(),inFlight=useRef(false),delivered=useRef(new Set()),initialized=useRef(false),callbacks=useRef({onDelivered});
 callbacks.current={onDelivered};
 useEffect(()=>{let active=true;
   async function refresh(){try{const data=await api('/admin/contacts/'+contact.id+'/replies');if(!active)return;for(const r of data.slice(-1))if(r.state==='sent'&&!delivered.current.has(r.id)){delivered.current.add(r.id);if(initialized.current)callbacks.current.onDelivered?.();}initialized.current=true;}catch(e){if(active)setError(e.message);}}
   refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);return()=>{active=false;clearInterval(timer);};
 },[contact.id]);
 async function send(){
   if(inFlight.current)return;
   if(!body.trim()){setError('Rédigez votre réponse.');return;}
   if(submission.current?.body!==body.trim())submission.current={body:body.trim(),key:crypto.randomUUID()};
   inFlight.current=true;setBusy(true);setError('');setNotice('');
   try{await api('/admin/contacts/'+contact.id+'/replies',{method:'POST',body:{body:submission.current.body},headers:{'Idempotency-Key':submission.current.key}});setBody('');submission.current=null;onQueued?.();setNotice('Réponse enregistrée.');const history=await api('/admin/contacts/'+contact.id+'/replies');const last=history.at(-1);if(last?.state==='sent'){delivered.current.add(last.id);onDelivered?.();}}
   catch(e){setError(e.message);}finally{setBusy(false);inFlight.current=false;}
 }
 return <section className="contact-replies"><h3>Répondre au client</h3><p>Destinataire : <strong>{contact.email}</strong></p><label>Votre réponse par e-mail<textarea rows="7" maxLength="10000" value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="Bonjour…"/></label><button type="button" disabled={busy||!body.trim()} onClick={send}>{busy?'Envoi en cours…':'Envoyer la réponse par e-mail'}</button>{error&&<p role="alert" className="field-error">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}

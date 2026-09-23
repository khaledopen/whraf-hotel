import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessage} from '../src/notifications.js';

test('tous les e-mails gardent leurs informations et un thème sombre commun',async()=>{
 const row={id:1,status:'confirmed',name:'Client <test>',email:'test@example.invalid',phone:'+2250102030405',arrival:'2099-10-10',departure:'2099-10-12',adults:2,children:1,event_type:'Mariage',event_date:'2099-10-10',participants:20,subject:'Question',message:'Message <privé>',body:'Réponse <test>',recipient:'test@example.invalid'};
 const database={query:async()=>[[row]]};
 for(const [request_type,kind] of [['reservations','reception'],['events','reception'],['contacts','reception'],['reservations','confirmation'],['events','confirmation'],['contacts','reply']]){
  const mail=await buildMessage({id:1,request_id:1,request_type,kind},database,{SMTP_FROM:'hotel@example.invalid',NOTIFICATION_EMAIL:'admin@example.invalid'});
  assert.ok(mail.text);assert.match(mail.html,/prefers-color-scheme:dark/);assert.match(mail.html,/\[data-ogsc\]/);
  assert.match(mail.html,/class="mail-body mail-padding"[^>]*color:#1f2937/);
  assert.doesNotMatch(mail.html,/background:linear-gradient\(135deg/);
  assert.doesNotMatch(mail.html,/<test>|<privé>/);
  if(kind==='reply')assert.match(mail.html,/Réponse &lt;test&gt;/);
  else assert.match(mail.html,/Client &lt;test&gt;/);
 }
});

test('les couleurs de texte et de fond des thèmes offrent au moins 4,5 pour 1',()=>{
 const lum=hex=>hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
 for(const [text,bg] of [['#f3f4f6','#1f2937'],['#f3f4f6','#293548'],['#102a43','#b9e6f2'],['#1f2937','#ffffff'],['#4b5563','#f1f5f9'],['#ffffff','#0b3c5d'],['#ffffff','#7c3aed'],['#ffffff','#0f766e']]){
  const a=lum(text),b=lum(bg);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,`${text} sur ${bg}`);
 }
});

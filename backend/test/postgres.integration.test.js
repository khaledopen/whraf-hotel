import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcrypt';
import request from 'supertest';
import {pool,createDatabase,pgTypes} from '../src/db.js';
import {migrate} from '../src/migrations.js';
import {createApp} from '../src/app.js';
import {PostgreSQLSessionStore} from '../src/session-store.js';
import {createNotificationWorker} from '../src/notification-worker.js';
import {submitRequest,updateRequest,retryNotification} from '../src/requests.js';

test('PostgreSQL réel : réservations, administration et reprise SMTP (schéma isolé)',{skip:process.env.RUN_PG_TESTS!=='true'},async t=>{
  const schema='wharf_test_'+randomUUID().replaceAll('-','');
  assert.match(schema,/^wharf_test_[a-f0-9]{32}$/);
  await pool.query(`CREATE SCHEMA ${schema}`);
  const testPool=new pg.Pool({...pool.options,password:pool.options.password,options:`-c search_path=${schema}`,types:pgTypes});
  const database=createDatabase(testPool);
  let store;
  try {
    await migrate(database);await migrate(database);
    await database.query(await readFile(new URL('../sql/demo.sql',import.meta.url),'utf8'));
    await database.query(await readFile(new URL('../sql/demo.sql',import.meta.url),'utf8'));
    await database.execute("INSERT INTO admins(email,password_hash) VALUES ($1,$2)",['admin@example.invalid',await bcrypt.hash('test-password-private',4)]);
    await database.execute("UPDATE room_types SET status='published',validated=TRUE,is_demo=FALSE,price_fcfa=120000 WHERE id=1");
    process.env.SESSION_SECRET='integration-only-secret-12345678901234567890';
    store=new PostgreSQLSessionStore(database);
    const app=createApp({database,sessionStore:store});
    const valid={name:'Client <b>test</b>',email:'client@example.invalid',phone:'+2250102030405',arrival:'2099-10-10',departure:'2099-10-12',adults:1,children:0,room_type_id:1,message:'Test isolé',consent:true};
    let reservationId;
    const messages=[];
    const env={SMTP_FROM:'hotel@example.invalid',NOTIFICATION_EMAIL:'reception@example.invalid'};

    await t.test('contenu et montants PostgreSQL lisibles',async()=>{
      const r=await request(app).get('/api/content');assert.equal(r.status,200);assert.equal(r.body.rooms[0].price_fcfa,120000);
    });
    await t.test('deux envois simultanés produisent une seule réservation et un seul e-mail en attente',async()=>{
      const key=randomUUID();const responses=await Promise.all([1,2].map(()=>request(app).post('/api/reservations').set('Idempotency-Key',key).send(valid)));
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);reservationId=responses[0].body.id;assert.equal(responses[1].body.id,reservationId);
      const [rows]=await database.query('SELECT * FROM reservation_requests');assert.equal(rows.length,1);assert.equal(rows[0].arrival,'2099-10-10');
      assert.equal((await database.query('SELECT * FROM notification_jobs'))[0].length,1);
      assert.equal((await request(app).post('/api/reservations').set('Idempotency-Key',key).send({...valid,name:'Autre nom'})).status,409);
    });
    await t.test('dates et capacité invalides rejetées sans insertion',async()=>{
      for(const change of [{departure:valid.arrival},{arrival:'2020-01-01'},{adults:3}])
        assert.equal((await request(app).post('/api/reservations').send({...valid,...change})).status,422);
      assert.equal((await database.query('SELECT * FROM reservation_requests'))[0].length,1);
    });
    await t.test('échec SMTP conservé puis repris par un nouveau worker',async()=>{
      const failing=createNotificationWorker({database,env,transport:{sendMail:async()=>{throw Object.assign(Error('sensitive server response'),{code:'EAUTH'});}}});
      assert.equal(await failing.processOne(),true);await failing.stop();
      const [rows]=await database.query('SELECT * FROM reservation_requests');assert.equal(rows[0].notification_status,'failed');
      const [jobs]=await database.query('SELECT * FROM notification_jobs');assert.equal(jobs[0].state,'failed');assert.equal(jobs[0].last_error,'Authentification SMTP refusée');
      await retryNotification(database,'reservations',reservationId,'reception');
      const worker=createNotificationWorker({database,env,transport:{sendMail:async m=>{messages.push(m);return {accepted:[m.to]};}}});
      await worker.drain();await worker.stop();assert.equal(messages.length,1);
      assert.equal((await database.query('SELECT notification_status FROM reservation_requests'))[0][0].notification_status,'sent');
    });
    const agent=request.agent(app);let csrf;
    await t.test('authentification et session réellement persistée',async()=>{
      assert.equal((await agent.get('/api/admin/reservations')).status,401);
      const session=await agent.get('/api/auth/session');
      const login=await agent.post('/api/auth/login').set('X-CSRF-Token',session.body.csrf).send({email:'admin@example.invalid',password:'test-password-private'});
      assert.equal(login.status,200);csrf=login.body.csrf;
      assert.equal((await database.query('SELECT * FROM sessions'))[0].length,1);
      assert.equal((await agent.get('/api/admin/dashboard')).status,200);
    });
    await t.test('recherche par client, statut et chevauchement des nuits',async()=>{
      const hit=await agent.get('/api/admin/reservations').query({q:'client@example.invalid',from:'2099-10-11',to:'2099-10-11',status:'pending'});
      assert.equal(hit.status,200);assert.equal(hit.body.length,1);
      assert.equal((await agent.get('/api/admin/reservations').query({from:'2099-10-12'})).body.length,0);
      assert.equal((await agent.get('/api/admin/reservations').query({q:"' OR 1=1 --"})).body.length,0);
      assert.equal((await agent.get('/api/admin/reservations').query({from:'2099-02-30'})).status,400);
      assert.equal((await agent.get('/api/admin/reservations').query({from:'2099-12-01',to:'2099-01-01'})).status,400);
    });
    await t.test('image téléversée conservée dans PostgreSQL et accessible après recréation du serveur',async()=>{
      const image=await readFile(new URL('../../frontend/public/photos/26.jpg',import.meta.url));
      assert.equal((await request(app).post('/api/admin/upload').attach('image',image,'room.jpg')).status,401);
      const uploaded=await agent.post('/api/admin/upload').set('X-CSRF-Token',csrf).attach('image',image,'room.jpg');
      assert.equal(uploaded.status,201);assert.match(uploaded.body.url,/^\/api\/images\/.+\.webp$/);
      const restarted=createApp({database,sessionStore:store});
      const fetched=await request(restarted).get(uploaded.body.url);
      assert.equal(fetched.status,200);assert.match(fetched.headers['content-type'],/image\/webp/);
      const created=await agent.post('/api/admin/media').set('X-CSRF-Token',csrf).send({url:uploaded.body.url,alt:'Chambre test',category:'Chambres',status:'draft',validated:false,is_demo:false});
      assert.equal(created.status,201);
      const room={slug:'photo-publication-test',name:'Photo publication',description:'Test',capacity:2,price_fcfa:null,conditions_text:'',status:'draft',validated:false,is_demo:false,amenity_ids:[],media_ids:[created.body.id]};
      const savedRoom=await agent.post('/api/admin/room_types').set('X-CSRF-Token',csrf).send(room);
      assert.equal(savedRoom.status,201);
      assert.equal((await database.query('SELECT status FROM media WHERE id=$1',[created.body.id]))[0][0].status,'draft');
      assert.equal((await agent.put('/api/admin/room_types/'+savedRoom.body.id).set('X-CSRF-Token',csrf).send({...room,status:'published',validated:true})).status,200);
      const content=await request(app).get('/api/content');
      const publicRoom=content.body.rooms.find(r=>r.id===savedRoom.body.id);
      assert.equal(publicRoom.media[0].url,uploaded.body.url);
      assert.equal((await request(app).get(publicRoom.media[0].url)).status,200);
      await database.execute("UPDATE media SET status='draft',validated=FALSE WHERE id=$1",[created.body.id]);
      await migrate(database);
      assert.equal((await request(app).get('/api/content')).body.rooms.find(r=>r.id===savedRoom.body.id).media[0].url,uploaded.body.url);
      assert.equal((await agent.post('/api/admin/upload').set('X-CSRF-Token',csrf).attach('image',Buffer.from('not an image'),'fake.jpg')).status,422);
    });
    await t.test('modification d’une chambre avec tables de liaison sans colonne id',async()=>{
      const body={slug:'chambre-test',name:'Chambre test',description:'Description test',capacity:2,price_fcfa:120000,conditions_text:null,status:'draft',validated:false,is_demo:true,amenity_ids:[],media_ids:[1,2]};
      assert.equal((await agent.put('/api/admin/room_types/1').send(body)).status,403);
      assert.equal((await agent.put('/api/admin/room_types/1').set('X-CSRF-Token',csrf).send(body)).status,200);
      assert.equal((await database.query('SELECT * FROM room_type_media WHERE room_type_id=1'))[0].length,2);
    });
    await t.test('confirmations concurrentes : un seul e-mail client, séparé de la notification interne',async()=>{
      const body={status:'confirmed',internal_notes:'Traitement test'};
      const rs=await Promise.all([1,2].map(()=>agent.put(`/api/admin/reservations/${reservationId}`).set('X-CSRF-Token',csrf).send(body)));
      assert.ok(rs.every(r=>r.status===200));
      assert.equal((await database.query("SELECT * FROM notification_jobs WHERE kind='confirmation'"))[0].length,1);
      const worker=createNotificationWorker({database,env,transport:{sendMail:async m=>{messages.push(m);return {accepted:[m.to]};}}});
      await Promise.all([worker.processOne(),worker.processOne()]);await worker.stop();
      assert.equal(messages.length,2);const mail=messages[1];assert.equal(mail.to,'client@example.invalid');assert.match(mail.text,/10\/10\/2099/);assert.ok(!mail.html.includes('<b>test</b>'));assert.match(mail.html,/&lt;b&gt;test/);
      const r=await agent.get('/api/admin/reservations');assert.equal(r.body[0].notifications.length,2);assert.ok(r.body[0].notifications.every(n=>n.state==='sent'));
      assert.equal((await agent.post(`/api/admin/reservations/${reservationId}/notifications/confirmation/retry`).set('X-CSRF-Token',csrf)).status,409);
    });
    await t.test('annulation avant traitement empêche une confirmation obsolète',async()=>{
      const r=await request(app).post('/api/events').send({name:'Test',email:'event@example.invalid',phone:'+2250102030405',event_type:'Séminaire',event_date:'2099-11-10',participants:20,message:'Test',consent:true});assert.equal(r.status,201);
      await updateRequest(database,'events',r.body.id,{status:'confirmed',internal_notes:''});
      await updateRequest(database,'events',r.body.id,{status:'cancelled',internal_notes:''});
      const [jobs]=await database.query("SELECT * FROM notification_jobs WHERE request_type='events' AND kind='confirmation'");assert.equal(jobs[0].state,'cancelled');
    });
    await t.test('messages : nouveau, en cours, répondu et archivé sans e-mail client',async()=>{
      const result=await request(app).post('/api/contacts').send({name:'Contact test',email:'workflow@example.invalid',subject:'Question',message:'Bonjour',consent:true});
      assert.equal(result.status,201);const id=result.body.id;
      assert.equal((await database.query('SELECT status FROM contact_messages WHERE id=$1',[id]))[0][0].status,'pending');
      for(const status of ['processing','replied','archived','pending']){
        assert.equal((await agent.put('/api/admin/contacts/'+id).set('X-CSRF-Token',csrf).send({status,internal_notes:'Note privée'})).status,200);
        const row=(await agent.get('/api/admin/contacts')).body.find(r=>r.id===id);
        assert.equal(row.status,status);assert.equal(row.internal_notes,'Note privée');
      }
      assert.equal((await agent.put('/api/admin/contacts/'+id).set('X-CSRF-Token',csrf).send({status:'confirmed',internal_notes:''})).status,422);
      assert.equal((await agent.put('/api/admin/reservations/'+reservationId).set('X-CSRF-Token',csrf).send({status:'replied',internal_notes:''})).status,422);
      const jobs=(await database.query("SELECT kind FROM notification_jobs WHERE request_type='contacts' AND request_id=$1",[id]))[0];
      assert.deepEqual(jobs.map(j=>j.kind),['reception']);
    });
    await t.test('absence de configuration SMTP visible et demande conservée',async()=>{
      const r=await request(app).post('/api/contacts').send({name:'Test',email:'contact@example.invalid',subject:'Test',message:'Test',consent:true});assert.equal(r.status,201);
      const worker=createNotificationWorker({database,env,transport:null});await worker.drain();await worker.stop();
      const [jobs]=await database.query("SELECT * FROM notification_jobs WHERE request_type='contacts'");assert.equal(jobs[0].state,'unconfigured');assert.equal(jobs[0].attempts,0);
    });
    await t.test('échec de mise en file : réservation et clé annulées ensemble',async()=>{
      const faulty={...database,getConnection:async()=>{const c=await database.getConnection();return {...c,execute:async(sql,params)=>{if(sql.startsWith('INSERT INTO notification_jobs'))throw Error('Queue unavailable');return c.execute(sql,params);}};}};
      const before=(await database.query('SELECT COUNT(*) AS total FROM reservation_requests'))[0][0].total;
      await assert.rejects(submitRequest(faulty,'reservations',{...valid,room_type_id:null},randomUUID()));
      assert.equal((await database.query('SELECT COUNT(*) AS total FROM reservation_requests'))[0][0].total,before);
    });
    await t.test('un envoi interrompu par un arrêt du serveur est récupéré',async()=>{
      await database.execute("UPDATE notification_jobs SET state='sending',locked_at=NOW()-INTERVAL '3 minutes',claim_token=$1 WHERE request_type='contacts'",[randomUUID()]);
      const mail=[];const worker=createNotificationWorker({database,env,transport:{sendMail:async m=>{mail.push(m);return {accepted:[m.to]};}}});
      await worker.processOne();await worker.stop();assert.equal(mail.length,1);
      assert.equal((await database.query("SELECT state FROM notification_jobs WHERE request_type='contacts'"))[0][0].state,'sent');
    });
    await t.test('réponse directe : recherche, idempotence, échec, relance et statut automatique',async()=>{
      const contact=(await agent.get('/api/admin/contacts').query({q:'workflow@example.invalid',status:'pending'})).body[0];
      assert.ok(contact);
      assert.equal((await agent.get('/api/admin/contacts').query({q:"' OR 1=1 --"})).body.length,0);
      const url='/api/admin/contacts/'+contact.id+'/replies',key=randomUUID(),body={body:'Bonjour <b>client</b>, voici notre réponse.'};
      assert.equal((await request(app).post(url).send(body)).status,401);
      assert.equal((await agent.post(url).send(body)).status,403);
      assert.equal((await agent.post(url).set('X-CSRF-Token',csrf).set('Idempotency-Key',randomUUID()).send({body:' '})).status,422);
      const rs=await Promise.all([1,2].map(()=>agent.post(url).set('X-CSRF-Token',csrf).set('Idempotency-Key',key).send(body)));
      assert.deepEqual(rs.map(r=>r.status).sort(),[200,202]);assert.equal(rs[0].body.id,rs[1].body.id);
      const replyId=rs[0].body.id;
      assert.equal((await agent.post(url).set('X-CSRF-Token',csrf).set('Idempotency-Key',key).send({body:'Autre réponse'})).status,409);
      let history=(await agent.get(url)).body;assert.equal(history.length,1);assert.equal(history[0].state,'pending');
      const failed=createNotificationWorker({database,env,transport:{sendMail:async()=>{throw Object.assign(Error('secret'),{code:'EAUTH'});}}});
      await failed.processReply(replyId);await failed.stop();
      history=(await agent.get(url)).body;assert.equal(history[0].state,'failed');assert.equal(history[0].last_error,'Authentification SMTP refusée');
      assert.equal((await agent.get('/api/admin/contacts').query({q:'workflow@example.invalid'})).body[0].status,'processing');
      assert.equal((await agent.post(url+'/'+replyId+'/retry').set('X-CSRF-Token',csrf)).status,200);
      const delivered=[];const worker=createNotificationWorker({database,env,transport:{sendMail:async m=>{delivered.push(m);return {accepted:[m.to]};}}});
      await Promise.all([worker.processReply(replyId),worker.processReply(replyId)]);await worker.stop();
      assert.equal(delivered.length,1);assert.equal(delivered[0].to,'workflow@example.invalid');assert.equal(delivered[0].text,body.body);
      assert.ok(delivered[0].html.includes('&lt;b&gt;client&lt;/b&gt;'));assert.ok(!delivered[0].html.includes('Note privée'));
      assert.equal((await agent.get(url)).body[0].state,'sent');
      const row=(await agent.get('/api/admin/contacts').query({q:'workflow@example.invalid'})).body[0];
      assert.equal(row.status,'replied');assert.ok(row.notifications.every(n=>n.kind!=='reply'));
      assert.equal((await agent.post(url+'/'+replyId+'/retry').set('X-CSRF-Token',csrf)).status,409);
    });
  } finally {
    store?.close();await testPool.end();
    // Only this test-created namespace is removed; never any hotel tables.
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();
  }
});

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
  } finally {
    store?.close();await testPool.end();
    // Only this test-created namespace is removed; never any hotel tables.
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();
  }
});

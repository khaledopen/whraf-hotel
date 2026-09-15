import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcrypt';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {db,demo,visibility} from './db.js';
import {validate,reservation,event,contact,schemas,requestUpdate} from './validation.js';
import {smtpConfiguration,createMailTransport,mailError} from './notifications.js';
import {submitRequest,updateRequest,retryNotification} from './requests.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const requestTables={reservations:'reservation_requests',events:'event_requests',contacts:'contact_messages'};
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({database=db,sessionStore,transport,drainNotifications}={}){
 const app=express();const production=process.env.NODE_ENV==='production';
 app.use((req,_res,next)=>{if(req.url.startsWith('/content')||req.url.startsWith('/health')||req.url.startsWith('/auth')||req.url.startsWith('/reservations')||req.url.startsWith('/events')||req.url.startsWith('/contacts')||req.url.startsWith('/admin')||req.url.startsWith('/images'))req.url='/api'+req.url;next();});
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32||process.env.SESSION_SECRET.startsWith('replace-'))throw Error('Configurez SESSION_SECRET avec au moins 32 caractères aléatoires.');
 if(production&&!sessionStore)throw Error('Un magasin de sessions persistant est requis en production.');
 if(production)app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:'],'font-src':["'self'",'https://fonts.gstatic.com'],'style-src':["'self'","'unsafe-inline'",'https://fonts.googleapis.com']}}}));
 app.use(cors({origin:(origin,cb)=>{if(!origin||origin.endsWith('.vercel.app')||origin.includes('localhost')||origin.includes('127.0.0.1')||(process.env.PUBLIC_ORIGIN&&origin===process.env.PUBLIC_ORIGIN))return cb(null,true);cb(null,true);},credentials:true}));app.use(express.json({limit:'64kb'}));
 app.use('/uploads',express.static(path.join(root,'uploads'),{maxAge:'7d',dotfiles:'deny'}));
 app.use(session({name:'wharf.sid',secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,store:sessionStore,cookie:{httpOnly:true,sameSite:'lax',secure:production,maxAge:8*60*60*1000}}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.param('id',(req,res,next,id)=>{if(!/^[1-9]\d*$/.test(id)||Number(id)>2147483647)return res.status(400).json({message:'Identifiant invalide.'});next();});
 const requireAdmin=(req,res,next)=>req.session.adminId?next():res.status(401).json({message:'Connexion requise.'});
 const csrf=(req,res,next)=>{if(!safeEqual(req.get('X-CSRF-Token'),req.session.csrf))return res.status(403).json({message:'Session expirée. Rechargez la page.'});next();};
 app.get('/api/health',async(_req,res)=>{try{await database.query('SELECT 1');res.json({ok:true});}catch{res.status(503).json({message:'Base PostgreSQL indisponible.'});}});
 app.get('/api/images/:name',async(req,res)=>{if(!/^[a-f0-9-]{36}\.webp$/.test(req.params.name))return res.sendStatus(404);const [rows]=await database.query('SELECT data FROM uploaded_images WHERE name=$1',[req.params.name]);if(!rows.length)return res.sendStatus(404);res.set('Cache-Control','public, max-age=31536000, immutable').type('image/webp').send(rows[0].data);});
 app.get('/api/content',async(_req,res)=>{
 const [rooms]=await database.query(`SELECT * FROM room_types WHERE ${visibility}`);
 const [media]=await database.query(`SELECT * FROM media WHERE ${visibility}`);
 const [pages]=await database.query(`SELECT * FROM page_contents WHERE ${visibility}`);
 const [settings]=await database.query(`SELECT setting_key,value,validated FROM hotel_settings ${demo?'':'WHERE validated=TRUE'}`);
 const [links]=await database.query('SELECT * FROM room_type_media');const [amenityLinks]=await database.query('SELECT ra.room_type_id,a.id,a.name FROM room_type_amenities ra JOIN amenities a ON a.id=ra.amenity_id');
 res.json({demo,rooms:rooms.map(r=>({...r,media:media.filter(m=>links.some(l=>l.room_type_id===r.id&&l.media_id===m.id)),amenities:amenityLinks.filter(a=>a.room_type_id===r.id)})),media,pages,settings:Object.fromEntries(settings.map(s=>[s.setting_key,s.value]))});
 });
 const formLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Trop de demandes. Réessayez dans quelques minutes.'}});
 for(const [route,schema] of Object.entries({reservations:reservation,events:event,contacts:contact})){
 app.post(`/api/${route}`,formLimit,async(req,res)=>{
 const data=validate(schema,req.body);
 const result=await submitRequest(database,route,data,req.get('Idempotency-Key'));
 res.status(result.replayed?200:201).json({id:result.id,message:route==='reservations'?'Votre demande a bien été reçue. L’hôtel vous contactera pour confirmer la disponibilité et les modalités de votre séjour.':'Votre demande a bien été reçue. L’hôtel vous contactera prochainement.'});
 // In serverless environments (Vercel), drain notification queue inline since no background worker runs.
 if(drainNotifications) drainNotifications().catch(e=>console.error('Notifications inline:',e?.message||e));
 });}
 app.get('/api/auth/session',(req,res)=>{req.session.csrf ||= randomBytes(32).toString('hex');res.json({authenticated:!!req.session.adminId,csrf:req.session.csrf});});
 app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:5,message:{message:'Trop de tentatives. Réessayez dans 15 minutes.'}}),csrf,async(req,res)=>{
 const {email,password}=req.body;if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>200)return res.status(400).json({message:'Identifiants invalides.'});
 const [rows]=await database.execute('SELECT id,password_hash FROM admins WHERE email=$1',[email]);
 const fallback='$2b$12$C6UzMDM.H6dfI/f/IKcEe.9AoHW1WoMlGYpf/BA.sxrTnB/AZq1ES';
 const valid=await bcrypt.compare(password,rows[0]?.password_hash||fallback);if(!rows.length||!valid)return res.status(401).json({message:'Identifiants invalides.'});
 await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));req.session.adminId=rows[0].id;req.session.csrf=randomBytes(32).toString('hex');res.json({authenticated:true,csrf:req.session.csrf});
 });
 app.post('/api/auth/logout',requireAdmin,csrf,(req,res,next)=>req.session.destroy(e=>{if(e)return next(e);res.clearCookie('wharf.sid');res.json({ok:true});}));
 app.use('/api/admin',requireAdmin,(req,res,next)=>{if(['GET','HEAD'].includes(req.method))return next();csrf(req,res,next);});
 app.get('/api/admin/mail-status',(_req,res)=>res.json(smtpConfiguration()));
 app.post('/api/admin/mail-verify',async(_req,res)=>{const config=smtpConfiguration();if(!config.configured)return res.status(422).json({message:'Configuration SMTP incomplète.',missing:config.missing});const smtp=transport||createMailTransport();try{await smtp.verify();res.json({ok:true,message:'Connexion SMTP validée. Aucun e-mail de test envoyé.'});}catch(e){res.status(502).json({message:mailError(e)});}finally{if(!transport)smtp?.close();}});
 app.get('/api/admin/dashboard',async(_req,res)=>{const counts={};for(const [key,table] of Object.entries(requestTables)){const [rows]=await database.query(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status='pending' THEN 1 END) AS pending, (SELECT COUNT(*) FROM notification_jobs WHERE request_type=$1 AND state IN ('failed','unconfigured')) AS notification_failures FROM ${table}`,[key]);counts[key]=rows[0];}res.json(counts);});
 for(const [key,table] of Object.entries(requestTables)){
 app.get(`/api/admin/${key}`,async(req,res)=>{
   const params=[key],clauses=[];if(key==='reservations'){const {q,status,from,to}=req.query;const add=(sql,value)=>{params.push(value);clauses.push(sql.replaceAll('?', String.fromCharCode(36)+params.length));};if(q){if(typeof q!=='string'||q.length>200)return res.status(400).json({message:'Recherche invalide.'});add("(r.name ILIKE ? OR r.email ILIKE ? OR r.phone ILIKE ? OR r.id::text ILIKE ?)",'%'+q+'%');}if(status){if(!['pending','processing','confirmed','declined','cancelled'].includes(status))return res.status(400).json({message:'Statut invalide.'});add('r.status=?',status);}for(const value of [from,to])if(value&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))return res.status(400).json({message:'Date invalide.'});if(from&&to&&from>to)return res.status(400).json({message:'Période invalide.'});if(from)add('r.departure>?',from);if(to)add('r.arrival<=?',to);}

   const [rows]=await database.query(`SELECT r.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',n.kind,'state',n.state,'attempts',n.attempts,'last_error',n.last_error,'sent_at',n.sent_at,'next_attempt_at',n.next_attempt_at) ORDER BY n.id) FROM notification_jobs n WHERE n.request_type=$1 AND n.request_id=r.id),'[]'::jsonb) AS notifications FROM ${table} r ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY r.created_at DESC ${key==='reservations'?'':'LIMIT 1000'}`,params);res.json(rows);
 });
 app.put(`/api/admin/${key}/:id`,async(req,res)=>{await updateRequest(database,key,req.params.id,validate(requestUpdate,req.body));res.json({ok:true});});
 app.post(`/api/admin/${key}/:id/notifications/:kind/retry`,async(req,res)=>{await retryNotification(database,key,req.params.id,req.params.kind);res.json({ok:true,message:'E-mail remis en attente.'});});
 }
 for(const [table,schema] of Object.entries(schemas)){
 app.get(`/api/admin/${table}`,async(_req,res)=>{const [rows]=await database.query(`SELECT * FROM ${table} ORDER BY id DESC`);if(table==='room_types'){const [a]=await database.query('SELECT * FROM room_type_amenities');const [m]=await database.query('SELECT * FROM room_type_media');for(const row of rows){row.amenity_ids=a.filter(x=>x.room_type_id===row.id).map(x=>x.amenity_id);row.media_ids=m.filter(x=>x.room_type_id===row.id).map(x=>x.media_id);}}res.json(rows);});
 const save=async(req,res)=>{
 const {amenity_ids,media_ids,...data}=validate(schema,req.body);if(data.status==='published'&&(!data.validated||data.is_demo))return res.status(422).json({message:'La publication exige un contenu validé et non démonstratif.'});
 const conn=await database.getConnection();try{await conn.beginTransaction();let id=Number(req.params.id);const keys=Object.keys(data);
 if(req.params.id){const [r]=await conn.execute(`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${keys.length+1}`,[...Object.values(data),id]);if(!r.affectedRows){const e=Error('Contenu introuvable.');e.status=404;throw e;}}
 else {const [r]=await conn.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING id`,Object.values(data));id=r.insertId;}
 if(table==='room_types'){for(const [join,column,ids] of [['room_type_amenities','amenity_id',amenity_ids],['room_type_media','media_id',media_ids]]){await conn.execute(`DELETE FROM ${join} WHERE room_type_id=$1`,[id]);for(const linked of new Set(ids))await conn.execute(`INSERT INTO ${join}(room_type_id,${column}) VALUES ($1,$2)`,[id,linked]);}}
  if(table==='room_types'&&data.status==='published'){
    const [linkedMedia]=await conn.execute('SELECT media_id FROM room_type_media WHERE room_type_id=$1',[id]);
    const allMediaIds=Array.isArray(linkedMedia)?linkedMedia.map(r=>r.media_id):(linkedMedia?.rows||[]).map(r=>r.media_id);
    if(allMediaIds.length)await conn.execute("UPDATE media SET status='published',validated=TRUE,updated_at=NOW() WHERE id=ANY($1::int[]) AND is_demo=FALSE",[allMediaIds]);
  }
 await conn.commit();res.status(req.params.id?200:201).json({id});}catch(e){await conn.rollback();throw e;}finally{conn.release();}
 };
 app.post(`/api/admin/${table}`,save);app.put(`/api/admin/${table}/:id`,save);
 app.delete(`/api/admin/${table}/:id`,async(req,res)=>{const [r]=await database.execute(`DELETE FROM ${table} WHERE id=$1`,[req.params.id]);res.status(r.affectedRows?200:404).json({message:r.affectedRows?'Supprimé.':'Introuvable.'});});
 }
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
 app.post('/api/admin/upload',upload.single('image'),async(req,res)=>{if(!req.file)return res.status(422).json({message:'Image JPEG, PNG ou WebP requise (4 Mo maximum).'});try{const output=await sharp(req.file.buffer,{limitInputPixels:25000000}).rotate().resize({width:1800,withoutEnlargement:true}).webp({quality:82}).toBuffer();const name=`${randomUUID()}.webp`;await database.execute('INSERT INTO uploaded_images(name,data) VALUES ($1,$2)',[name,output]);res.status(201).json({url:`/api/images/${name}`});}catch{res.status(422).json({message:'Image invalide ou trop grande.'});}});
 app.use('/api',(_req,res)=>res.status(404).json({message:'Route introuvable.'}));
 app.get('/sitemap.xml',async(_req,res)=>{const origin=process.env.PUBLIC_ORIGIN;if(!origin)return res.status(503).send('Domaine à configurer.');const urls=['','hotel','chambres','restaurant','piscine-plage','evenements','galerie','reservation','contact','mentions-legales','confidentialite'];const [rooms]=await database.query(`SELECT slug FROM room_types WHERE ${visibility}`);urls.push(...rooms.map(r=>`chambres/${encodeURIComponent(r.slug)}`));res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${origin.replace(/&/g,'&amp;')}/${u}</loc></url>`).join('')}</urlset>`);});
 app.use(express.static(path.resolve(root,'../frontend/dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve(root,'../frontend/dist/index.html')));
 app.use((err,_req,res,_next)=>{const errors={23505:[409,'Cet identifiant existe déjà.'],23503:[422,'Un contenu associé est introuvable ou encore utilisé.'],LIMIT_FILE_SIZE:[413,'L’image dépasse 4 Mo.']};const mapped=errors[err.code];const status=err.status||mapped?.[0]||500;if(status===500)console.error('API :',err.code||err.name||'ERROR');res.status(status).json({message:mapped?.[1]||(status===500?'Service momentanément indisponible. Réessayez plus tard.':err.message),fields:err.fields});});
 return app;
}

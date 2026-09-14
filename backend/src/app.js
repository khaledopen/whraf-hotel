import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcrypt';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {db,demo,visibility} from './db.js';
import {validate,reservation,event,contact,schemas,requestUpdate} from './validation.js';
import {notify} from './notifications.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const requestTables={reservations:'reservation_requests',events:'event_requests',contacts:'contact_messages'};
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({database=db,sessionStore,transport}={}){
 const app=express();const production=process.env.NODE_ENV==='production';
 if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32||process.env.SESSION_SECRET.startsWith('replace-'))throw Error('Configurez SESSION_SECRET avec au moins 32 caractères aléatoires.');
 if(production&&!sessionStore)throw Error('Un magasin de sessions persistant est requis en production.');
 if(production)app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:'],'font-src':["'self'",'https://fonts.gstatic.com'],'style-src':["'self'","'unsafe-inline'",'https://fonts.googleapis.com']}}}));
 app.use(cors({origin:process.env.PUBLIC_ORIGIN||'http://127.0.0.1:5173',credentials:true}));app.use(express.json({limit:'64kb'}));
 app.use('/uploads',express.static(path.join(root,'uploads'),{maxAge:'7d',dotfiles:'deny'}));
 app.use(session({name:'wharf.sid',secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,store:sessionStore,cookie:{httpOnly:true,sameSite:'lax',secure:production,maxAge:8*60*60*1000}}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const requireAdmin=(req,res,next)=>req.session.adminId?next():res.status(401).json({message:'Connexion requise.'});
 const csrf=(req,res,next)=>{if(!safeEqual(req.get('X-CSRF-Token'),req.session.csrf))return res.status(403).json({message:'Session expirée. Rechargez la page.'});next();};
 app.get('/api/health',async(_req,res)=>{try{await database.query('SELECT 1');res.json({ok:true});}catch{res.status(503).json({message:'Base MySQL indisponible.'});}});
 app.get('/api/content',async(_req,res)=>{
 const [rooms]=await database.query(`SELECT * FROM room_types WHERE ${visibility}`);
 const [media]=await database.query(`SELECT * FROM media WHERE ${visibility}`);
 const [pages]=await database.query(`SELECT * FROM page_contents WHERE ${visibility}`);
 const [settings]=await database.query(`SELECT setting_key,value,validated FROM hotel_settings ${demo?'':'WHERE validated=1'}`);
 const [links]=await database.query('SELECT * FROM room_type_media');const [amenityLinks]=await database.query('SELECT ra.room_type_id,a.id,a.name FROM room_type_amenities ra JOIN amenities a ON a.id=ra.amenity_id');
 res.json({demo,rooms:rooms.map(r=>({...r,media:media.filter(m=>links.some(l=>l.room_type_id===r.id&&l.media_id===m.id)),amenities:amenityLinks.filter(a=>a.room_type_id===r.id)})),media,pages,settings:Object.fromEntries(settings.map(s=>[s.setting_key,s.value]))});
 });
 const formLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Trop de demandes. Réessayez dans quelques minutes.'}});
 for(const [route,schema] of Object.entries({reservations:reservation,events:event,contacts:contact})){
 app.post(`/api/${route}`,formLimit,async(req,res)=>{
 const data=validate(schema,req.body);
 if(route==='reservations'&&data.room_type_id){const [rows]=await database.execute(`SELECT capacity FROM room_types WHERE id=? AND ${visibility}`,[data.room_type_id]);if(!rows.length)return res.status(422).json({message:'Catégorie indisponible.',fields:{room_type_id:'Choisissez une catégorie publiée.'}});if(rows[0].capacity&&data.adults+data.children>rows[0].capacity)return res.status(422).json({message:'Capacité dépassée.',fields:{adults:'Le nombre de voyageurs dépasse la capacité de cette chambre.'}});}
 const table=requestTables[route];const keys=Object.keys(data);const [result]=await database.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));
 // Persist first. SMTP failure can never roll back a received request.
 try{await notify({table,id:result.insertId},database,transport);}catch{ /* pending remains visible to administrator if status update failed */ }
 res.status(201).json({id:result.insertId,message:route==='reservations'?'Votre demande a bien été reçue. L’hôtel vous contactera pour confirmer la disponibilité et les modalités de votre séjour.':'Votre demande a bien été reçue. L’hôtel vous contactera prochainement.'});
 });}
 app.get('/api/auth/session',(req,res)=>{req.session.csrf ||= randomBytes(32).toString('hex');res.json({authenticated:!!req.session.adminId,csrf:req.session.csrf});});
 app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:5,message:{message:'Trop de tentatives. Réessayez dans 15 minutes.'}}),csrf,async(req,res)=>{
 const {email,password}=req.body;if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>200)return res.status(400).json({message:'Identifiants invalides.'});
 const [rows]=await database.execute('SELECT id,password_hash FROM admins WHERE email=?',[email]);
 const fallback='$2b$12$C6UzMDM.H6dfI/f/IKcEe.9AoHW1WoMlGYpf/BA.sxrTnB/AZq1ES';
 const valid=await bcrypt.compare(password,rows[0]?.password_hash||fallback);if(!rows.length||!valid)return res.status(401).json({message:'Identifiants invalides.'});
 await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));req.session.adminId=rows[0].id;req.session.csrf=randomBytes(32).toString('hex');res.json({authenticated:true,csrf:req.session.csrf});
 });
 app.post('/api/auth/logout',requireAdmin,csrf,(req,res,next)=>req.session.destroy(e=>{if(e)return next(e);res.clearCookie('wharf.sid');res.json({ok:true});}));
 app.use('/api/admin',requireAdmin,(req,res,next)=>{if(['GET','HEAD'].includes(req.method))return next();csrf(req,res,next);});
 app.get('/api/admin/dashboard',async(_req,res)=>{const counts={};for(const [key,table] of Object.entries(requestTables)){const [rows]=await database.query(`SELECT COUNT(*) AS total,SUM(status='pending') AS pending,SUM(notification_status IN ('failed','pending')) AS notification_failures FROM ${table}`);counts[key]=rows[0];}res.json(counts);});
 for(const [key,table] of Object.entries(requestTables)){
 app.get(`/api/admin/${key}`,async(_req,res)=>{const [rows]=await database.query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 1000`);res.json(rows);});
 app.put(`/api/admin/${key}/:id`,async(req,res)=>{const data=validate(requestUpdate,req.body);const [r]=await database.execute(`UPDATE ${table} SET status=?,internal_notes=? WHERE id=?`,[data.status,data.internal_notes,req.params.id]);if(!r.affectedRows)return res.status(404).json({message:'Demande introuvable.'});res.json({ok:true});});
 }
 for(const [table,schema] of Object.entries(schemas)){
 app.get(`/api/admin/${table}`,async(_req,res)=>{const [rows]=await database.query(`SELECT * FROM ${table} ORDER BY id DESC`);if(table==='room_types'){const [a]=await database.query('SELECT * FROM room_type_amenities');const [m]=await database.query('SELECT * FROM room_type_media');for(const row of rows){row.amenity_ids=a.filter(x=>x.room_type_id===row.id).map(x=>x.amenity_id);row.media_ids=m.filter(x=>x.room_type_id===row.id).map(x=>x.media_id);}}res.json(rows);});
 const save=async(req,res)=>{
 const {amenity_ids,media_ids,...data}=validate(schema,req.body);if(data.status==='published'&&(!data.validated||data.is_demo))return res.status(422).json({message:'La publication exige un contenu validé et non démonstratif.'});
 const conn=await database.getConnection();try{await conn.beginTransaction();let id=Number(req.params.id);const keys=Object.keys(data);
 if(req.params.id){const [r]=await conn.execute(`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...Object.values(data),id]);if(!r.affectedRows){const e=Error('Contenu introuvable.');e.status=404;throw e;}}
 else {const [r]=await conn.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));id=r.insertId;}
 if(table==='room_types'){for(const [join,column,ids] of [['room_type_amenities','amenity_id',amenity_ids],['room_type_media','media_id',media_ids]]){await conn.execute(`DELETE FROM ${join} WHERE room_type_id=?`,[id]);for(const linked of new Set(ids))await conn.execute(`INSERT INTO ${join}(room_type_id,${column}) VALUES (?,?)`,[id,linked]);}}
 await conn.commit();res.status(req.params.id?200:201).json({id});}catch(e){await conn.rollback();throw e;}finally{conn.release();}
 };
 app.post(`/api/admin/${table}`,save);app.put(`/api/admin/${table}/:id`,save);
 app.delete(`/api/admin/${table}/:id`,async(req,res)=>{const [r]=await database.execute(`DELETE FROM ${table} WHERE id=?`,[req.params.id]);res.status(r.affectedRows?200:404).json({message:r.affectedRows?'Supprimé.':'Introuvable.'});});
 }
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
 app.post('/api/admin/upload',upload.single('image'),async(req,res)=>{if(!req.file)return res.status(422).json({message:'Image JPEG, PNG ou WebP requise (5 Mo maximum).'});try{const output=await sharp(req.file.buffer,{limitInputPixels:25000000}).rotate().resize({width:1800,withoutEnlargement:true}).webp({quality:82}).toBuffer();await mkdir(path.join(root,'uploads'),{recursive:true});const name=`${randomUUID()}.webp`;await sharp(output).toFile(path.join(root,'uploads',name));res.status(201).json({url:`/uploads/${name}`});}catch{res.status(422).json({message:'Image invalide ou trop grande.'});}});
 app.use('/api',(_req,res)=>res.status(404).json({message:'Route introuvable.'}));
 app.get('/sitemap.xml',async(_req,res)=>{const origin=process.env.PUBLIC_ORIGIN;if(!origin)return res.status(503).send('Domaine à configurer.');const urls=['','hotel','chambres','restaurant','piscine-plage','evenements','galerie','reservation','contact','mentions-legales','confidentialite'];const [rooms]=await database.query(`SELECT slug FROM room_types WHERE ${visibility}`);urls.push(...rooms.map(r=>`chambres/${encodeURIComponent(r.slug)}`));res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${origin.replace(/&/g,'&amp;')}/${u}</loc></url>`).join('')}</urlset>`);});
 app.use(express.static(path.resolve(root,'../frontend/dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve(root,'../frontend/dist/index.html')));
 app.use((err,_req,res,_next)=>{const status=err.status|| (err.code==='LIMIT_FILE_SIZE'?413:500);res.status(status).json({message:status===500?'Service momentanément indisponible. Réessayez plus tard.':err.message,fields:err.fields});});
 return app;
}

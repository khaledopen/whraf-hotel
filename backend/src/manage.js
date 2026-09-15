import {readFile} from 'node:fs/promises';
import {db} from './db.js';
import {migrate} from './migrations.js';
import bcrypt from 'bcrypt';
import {createInterface} from 'node:readline/promises';
const cmd=process.argv[2];
try{
 if(['migrate','seed'].includes(cmd)){
 if(cmd==='seed'&&process.env.NODE_ENV==='production')throw Error('Jeu de démonstration interdit en production.');
 if(cmd==='migrate') await migrate(db);
 else {const conn=await db.getConnection();try{await conn.beginTransaction();await conn.query(await readFile(new URL('../sql/demo.sql',import.meta.url),'utf8'));await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
 console.log('Base PostgreSQL mise à jour.');
 }else if(cmd==='admin'){
 const rl=createInterface({input:process.stdin,output:process.stdout});const email=(await rl.question('E-mail administrateur : ')).trim();
 console.log('Définissez ADMIN_PASSWORD dans l’environnement pour fournir un mot de passe sans affichage.');rl.close();const password=process.env.ADMIN_PASSWORD;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length<14)throw Error('E-mail valide et ADMIN_PASSWORD de 14 caractères minimum requis.');
 await db.execute('INSERT INTO admins(email,password_hash) VALUES ($1,$2)',[email,await bcrypt.hash(password,12)]);console.log('Administrateur créé.');
 }else throw Error('Commande inconnue.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.end();}

import {readFile} from 'node:fs/promises';
import {db} from './db.js';
import bcrypt from 'bcrypt';
import {createInterface} from 'node:readline/promises';
const cmd=process.argv[2];
try{
 if(['migrate','seed'].includes(cmd)){
 if(cmd==='seed'&&process.env.NODE_ENV==='production')throw Error('Jeu de démonstration interdit en production.');
 const sql=await readFile(new URL(`../sql/${cmd==='migrate'?'schema':'demo'}.sql`,import.meta.url),'utf8');for(const statement of sql.split(';').filter(s=>s.trim()))await db.query(statement);console.log('Base mise à jour.');
 }else if(cmd==='admin'){
 const rl=createInterface({input:process.stdin,output:process.stdout});const email=(await rl.question('E-mail administrateur : ')).trim();
 console.log('Définissez ADMIN_PASSWORD dans l’environnement pour fournir un mot de passe sans affichage.');rl.close();const password=process.env.ADMIN_PASSWORD;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length<14)throw Error('E-mail valide et ADMIN_PASSWORD de 14 caractères minimum requis.');
 await db.execute('INSERT INTO admins(email,password_hash) VALUES (?,?)',[email,await bcrypt.hash(password,12)]);console.log('Administrateur créé.');
 }else throw Error('Commande inconnue.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.end();}

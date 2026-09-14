import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const directory of ['backend/src','backend/test'])for(const file of readdirSync(directory).filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',`${directory}/${file}`]);
for(const file of ['package.json','frontend/package.json','backend/package.json'])JSON.parse(readFileSync(file,'utf8'));
const demo=readFileSync('frontend/src/demo.js','utf8');
for(const id of [...demo.matchAll(/\['(\d+)'/g)].map(m=>m[1]))if(!existsSync(`frontend/public/photos/${id}.jpg`))throw Error(`Photo absente : ${id}`);
console.log('Syntaxe JavaScript serveur, JSON et photographies de démonstration : OK.');

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerDashboard} from '../src/dashboard.js';
test('historique : seules les opérations réussies sont enregistrées, sans données client',async()=>{
 let middleware;const writes=[];
 registerDashboard({use:(_path,fn)=>middleware=fn,get:()=>{}},{query:async()=>[[]],execute:async(sql,args)=>{writes.push({sql,args});}});
 async function invoke(path,method,status,body){await new Promise(resolve=>{const res={statusCode:status,json:()=>resolve()};middleware({path,method,session:{adminId:7}},res,()=>res.json(body));});}
 await invoke('/contacts/4/replies','POST',202,{id:9});
 await invoke('/room_types/2','DELETE',200,{});
 await invoke('/contacts/4/replies','POST',422,{message:'Invalid'});
 await invoke('/mail-process','POST',200,{});
 assert.equal(writes.length,2);assert.deepEqual(writes[0].args,[7,'reply','contacts','4']);assert.deepEqual(writes[1].args,[7,'delete','room_types','2']);
});
test('graphiques : les trois types de demandes sont regroupés et l’historique est borné',async()=>{
 let handler;const queries=[];
 registerDashboard({use:()=>{},get:(_path,fn)=>handler=fn},{query:async sql=>{queries.push(sql);if(sql.includes('GROUP BY day'))return [[{day:'2026-10-14',total:2}]];if(sql.includes('GROUP BY status'))return [[{status:'pending',total:3}]];return [[]];}});
 let result;await handler({}, {json:value=>result=value});assert.equal(result.series.length,3);assert.equal(result.statuses.length,3);assert.deepEqual(result.series.map(row=>row.section),['reservations','events','contacts']);assert.ok(queries.at(-1).includes('LIMIT 100'));assert.ok(queries.some(sql=>sql.includes("INTERVAL '29 days'")));
});

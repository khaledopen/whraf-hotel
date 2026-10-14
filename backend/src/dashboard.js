const tables={reservations:'reservation_requests',events:'event_requests',contacts:'contact_messages'};
export function registerDashboard(app,database){
 let ready;
 const ensure=()=>ready ||= database.query(`CREATE TABLE IF NOT EXISTS admin_operations (id BIGSERIAL PRIMARY KEY,admin_id INTEGER NOT NULL,action TEXT NOT NULL,section TEXT NOT NULL,record_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error=>{ready=null;throw error;});
 app.use('/api/admin', (req,res,next)=>{
  const match=req.path.match(/^\/(reservations|events|contacts|room_types|amenities|media|page_contents|hotel_settings|upload)(?:\/(\d+))?(?:\/replies(?:\/(\d+)\/retry)?|\/notifications\/[^/]+\/retry)?$/);
  if(!match||!['POST','PUT','DELETE'].includes(req.method))return next();
  const send=res.json.bind(res);
  res.json=body=>{if(res.statusCode>=400||body?.replayed)return send(body);
   const action=req.path.includes('/replies')?'reply':req.path.includes('/notifications/')?'retry':req.method==='DELETE'?'delete':req.method==='PUT'?'update':'create';
   ensure().then(()=>database.execute('INSERT INTO admin_operations(admin_id,action,section,record_id) VALUES ($1,$2,$3,$4)',[req.session.adminId,action,match[1],String(match[2]||body?.id||'')])).then(()=>send(body)).catch(error=>{console.error('Historique administrateur indisponible :',error.code||error.name);send(body);});
   return res;
  };next();
 });
 app.get('/api/admin/dashboard-details',async(_req,res)=>{
  await ensure();
  const series=[],statuses=[];
  for(const [section,table] of Object.entries(tables)){
   const [daily]=await database.query(`SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,COUNT(*)::int AS total FROM ${table} WHERE created_at >= (CURRENT_DATE - INTERVAL '29 days') GROUP BY day ORDER BY day`);
   const [counts]=await database.query(`SELECT status,COUNT(*)::int AS total FROM ${table} GROUP BY status`);
   series.push(...daily.map(row=>({...row,section})));statuses.push(...counts.map(row=>({...row,section})));
  }
  const [operations]=await database.query('SELECT id,action,section,record_id,admin_id,created_at FROM admin_operations ORDER BY created_at DESC,id DESC LIMIT 100');
  res.json({series,statuses,operations});
 });
}

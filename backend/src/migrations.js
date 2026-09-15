import {readFile,readdir} from 'node:fs/promises';
export async function migrate(database) {
  const conn=await database.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8'));
    const directory=new URL('../sql/migrations/',import.meta.url);
    for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())
      await conn.query(await readFile(new URL(file,directory),'utf8'));
    await conn.commit();
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}

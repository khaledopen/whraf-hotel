import mysql from 'mysql2/promise';
export const db = mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'wharf',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'wharf_hotel',connectionLimit:10,dateStrings:true});
export const demo = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
export const visibility = demo ? '(is_demo = 1 OR (status = \'published\' AND validated = 1))' : "(status = 'published' AND validated = 1 AND is_demo = 0)";

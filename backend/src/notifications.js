import nodemailer from 'nodemailer';
export async function notify({table,id},database,transport){
 let status='unconfigured';
 if(transport || process.env.SMTP_HOST){try{const smtp=transport||nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:5000,socketTimeout:10000});await smtp.sendMail({from:process.env.SMTP_FROM,to:process.env.NOTIFICATION_EMAIL,subject:`Wharf Hôtel — nouvelle demande #${id}`,text:`Une demande (${table}) a été enregistrée sous le numéro ${id}. Consultez votre administration. La réception ne confirme pas le séjour.`});status='sent';}catch{status='failed';}}
 await database.execute(`UPDATE ${table} SET notification_status=? WHERE id=?`,[status,id]);return status;
}

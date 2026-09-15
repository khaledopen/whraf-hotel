import {createMailTransport,smtpConfiguration,mailError} from './notifications.js';
const config=smtpConfiguration();
if(!config.configured){console.error('Variables SMTP manquantes : '+config.missing.join(', '));process.exitCode=1;}
else {
  const smtp=createMailTransport();
  try{await smtp.verify();console.log('Connexion et authentification SMTP validées. Aucun e-mail envoyé.');}
  catch(e){console.error(mailError(e)+(e.responseCode?` (SMTP ${e.responseCode})`:''));process.exitCode=1;}
  finally{smtp.close();}
}

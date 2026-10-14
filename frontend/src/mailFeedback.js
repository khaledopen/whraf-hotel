export function mailFeedback(job, sentMessage='Message envoyé au client.') {
 if(job?.state==='sent')return {message:sentMessage,error:false};
 if(['failed','unconfigured'].includes(job?.state))return {message:'Le message n’a pas pu être envoyé. Veuillez réessayer plus tard.',error:true};
 if(job?.state==='cancelled')return {message:'Envoi annulé.',error:false};
 return {message:'Envoi en cours…',error:false};
}

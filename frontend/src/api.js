let csrf='';
export async function api(path,options={}){
 const isForm=options.body instanceof FormData;
 let response;try{response=await fetch(`${import.meta.env.VITE_API_URL||'/api'}${path}`,{credentials:'include',...options,headers:{...(!isForm&&options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers},body:options.body&&!isForm?JSON.stringify(options.body):options.body});}catch{throw Object.assign(Error('Connexion impossible. Vérifiez votre connexion et réessayez.'),{fields:{}});}
 const data=await response.json().catch(()=>({message:'Réponse du serveur illisible.'}));if(!response.ok)throw Object.assign(Error(data.message||'Une erreur est survenue.'),{fields:data.fields||{},status:response.status});if(data.csrf)csrf=data.csrf;return data;
}

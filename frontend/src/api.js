let csrf='';
export async function api(path,options={}) {
  const isForm=options.body instanceof FormData;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  try {
    const response=await fetch(`${import.meta.env.VITE_API_URL||'/api'}${path}`,{
      credentials:'include',...options,signal:options.signal||controller.signal,
      headers:{...(!isForm&&options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers},
      body:options.body&&!isForm?JSON.stringify(options.body):options.body
    });
    let data;
    try {data=await response.json();} catch(e) {if(e.name==='AbortError')throw e;throw Error('Réponse du serveur illisible. Réessayez.');}
    if(!response.ok)throw Object.assign(Error(data.message||'Une erreur est survenue.'),{fields:data.fields||{},status:response.status});
    if(data.csrf)csrf=data.csrf;
    return data;
  } catch(e) {
    if(e.name==='AbortError')throw Error('Le serveur met trop de temps à répondre. Réessayez avec les mêmes informations : la demande ne sera pas créée deux fois.');
    if(e instanceof TypeError)throw Error('Connexion impossible. Vérifiez votre connexion et réessayez.');
    throw e;
  } finally {clearTimeout(timer);}
}

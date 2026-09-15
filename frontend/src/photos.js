// Explicit correspondence with supplied photos; uploaded media remains untouched.
const replacements={
  '81':['ocean','Plage','Océan au coucher du soleil'],
  '109':['hotel','Hôtel','Façade et jardins du Wharf Hôtel'],
  '135':['hotel','Hôtel','Façade et jardins du Wharf Hôtel'],
  '26':['chambre','Chambres','Intérieur de chambre et coin salon'],
  '27':['piscine','Piscine','Vue de la piscine, des jardins et de l’océan'],
  '103':['bassin','Piscine','Bassin et terrasse de la piscine'],
  '15':['restaurant','Restaurant','Tables du restaurant sous les paillotes'],
  '61':['terrasse','Terrasse','Espace extérieur sous les cocotiers'],
  '129':['terrasse','Terrasse','Espace extérieur sous les cocotiers'],
  '115':['littoral','Plage','Littoral et cocotiers en fin de journée']
};
export function refreshPhotos(data){
  const convert=m=>{
    const match=m.url?.match(/^\/photos\/(\d+)\.jpg$/);
    const replacement=match&&replacements[match[1]];
    if(!replacement)return m;
    const [name,category,alt]=replacement;
    return {...m,url:`/photos/wharf-${name}-1536.webp`,category,alt:`${alt} — photographie retouchée`,retouched:true};
  };
  return {...data,media:data.media.map(convert),rooms:data.rooms.map(r=>({...r,media:r.media.map(convert).sort((a,b)=>Number(b.category==='Chambres')-Number(a.category==='Chambres'))}))};
}
export function responsivePhoto(url){
  return /^\/photos\/wharf-[a-z]+-1536\.webp$/.test(url)
    ? [640,1024,1536].map(w=>`${url.replace('1536',String(w))} ${w}w`).join(', ')
    : undefined;
}

import {z} from 'zod';
const text=(n)=>z.string().trim().min(1,'Ce champ est requis.').max(n,`Maximum ${n} caractères.`);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Abidjan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Date invalide.').refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Date invalide.');
const future=date.refine(v=>v>=today(),'Choisissez une date actuelle ou future.');
const integer=(min,max)=>z.number().int('Entrez un nombre entier.').min(min).max(max);
const base={name:text(150),email:z.email('Adresse e-mail invalide.').max(254),consent:z.literal(true,{error:'Votre accord est requis.'})};
const phone=text(40).regex(/^[+\d ().-]{6,40}$/,'Téléphone invalide.');
export const reservation=z.object({...base,phone,arrival:future,departure:date,adults:integer(1,100),children:integer(0,100),room_type_id:z.number().int().positive().nullable(),message:z.string().trim().max(5000).default('')}).refine(v=>v.departure>v.arrival,{path:['departure'],message:'Le départ doit être après l’arrivée.'});
export const event=z.object({...base,phone,event_type:text(100),event_date:future,participants:integer(1,100000),message:text(5000)});
export const contact=z.object({...base,subject:text(200),message:text(5000)});
const publishing={status:z.enum(['draft','published']),validated:z.boolean(),is_demo:z.boolean()};
export const schemas={
 room_types:z.object({slug:text(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:text(150),description:text(10000),capacity:integer(1,100).nullable(),price_fcfa:integer(0,1000000000).nullable(),conditions_text:z.string().max(5000).nullish().transform(v=>v||''),...publishing,amenity_ids:z.array(integer(1,100000)).default([]),media_ids:z.array(integer(1,100000)).default([])}),
 amenities:z.object({name:text(100)}),
 media:z.object({url:text(500).regex(/^\/(?:photos|uploads|api\/images)\/[a-zA-Z0-9._-]+$/,'Image locale requise.'),alt:text(250),category:text(100),...publishing}),
 page_contents:z.object({slug:text(120).regex(/^[a-z0-9-]+$/),title:text(200),body:text(20000),...publishing}),
 hotel_settings:z.object({setting_key:z.enum(['address','phone','email','facebook','maps']),value:text(2000),validated:z.boolean()}).superRefine((v,c)=>{if(['facebook','maps'].includes(v.setting_key)){try{const u=new URL(v.value);if(u.protocol!=='https:')throw Error();}catch{c.addIssue({code:'custom',path:['value'],message:'URL HTTPS requise.'});}}})
};
export const requestUpdate=z.object({status:z.enum(['pending','processing','confirmed','declined','cancelled']),internal_notes:z.string().max(10000)});
export function validate(schema,input){const r=schema.safeParse(input);if(!r.success){const e=new Error('Veuillez corriger les champs indiqués.');e.status=422;e.fields={};for(const i of r.error.issues)e.fields[i.path[0]||'form']=i.message;throw e;}return r.data;}

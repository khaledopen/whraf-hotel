import React,{useEffect,useRef,useState} from 'react';
export default function HeroVideo(){
 const video=useRef(null),[enabled,setEnabled]=useState(false),[playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
   const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
   const update=()=>{setEnabled(!preference.matches);if(preference.matches)video.current?.pause();};
   update();preference.addEventListener('change',update);
   return()=>preference.removeEventListener('change',update);
 },[]);
 async function toggle(){
   if(!enabled){setEnabled(true);return;}
   if(video.current?.paused){try{await video.current.play();}catch{setPlaying(false);}}
   else video.current?.pause();
 }
 return <><div className="hero-video" aria-hidden="true">
   <img src="/videos/wharf-home-banner-poster.webp" alt="" width="1920" height="720" fetchPriority="high"/>
   {enabled&&!failed&&<video ref={video} autoPlay muted loop playsInline preload="metadata" poster="/videos/wharf-home-banner-poster.webp" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>{setFailed(true);setPlaying(false);}}>
     <source src="/videos/wharf-home-banner.mp4" type="video/mp4"/>
   </video>}
 </div>{!failed&&<button type="button" className="hero-video-control" onClick={toggle} aria-label={playing?'Mettre la vidéo en pause':'Lire la vidéo'}>{playing?'Pause vidéo':'Lire la vidéo'}</button>}</>;
}

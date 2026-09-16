import React,{useEffect,useRef,useState} from 'react';
export default function HeroVideo(){
 const video=useRef(null),[enabled,setEnabled]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
   const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
   const update=()=>{setEnabled(!preference.matches);if(preference.matches)video.current?.pause();};
   update();preference.addEventListener('change',update);
   return()=>preference.removeEventListener('change',update);
 },[]);
 return <div className="hero-video" aria-hidden="true">
   <img src="/videos/wharf-home-banner-poster.webp" alt="" width="1920" height="720" fetchPriority="high"/>
   {enabled&&!failed&&<video ref={video} autoPlay muted loop playsInline preload="metadata" poster="/videos/wharf-home-banner-poster.webp" onError={()=>setFailed(true)}>
     <source src="/videos/wharf-home-banner.mp4" type="video/mp4"/>
   </video>}
 </div>;
}

/** landing-runtime.js */
(function(){
"use strict";
var d=document.documentElement,W=window,D=document,ls=localStorage,qA=function(s){return D.querySelectorAll(s);};
var clamp=function(v,a,b){return v<a?a:v>b?b:v;},sv=function(e,k,v){if(e)e.style.setProperty(k,v);};
var xy=function(e,p,a,b,u){if(e){e.style.setProperty(p+"x",a+u);e.style.setProperty(p+"y",b+u);}};
var pz=function(){return d.getAttribute("data-motion")==="paused";};
function syncM(p){for(var t=qA("[data-motion-toggle]"),lb=p?"Motion paused — Resume":"Pause motion",i=0;i<t.length;i++){t[i].setAttribute("aria-pressed",p?"true":"false");t[i].setAttribute("aria-label",lb);t[i].title=lb;}}
function setM(p){try{d.setAttribute("data-motion",p?"paused":"active");ls.setItem("inkwellio-motion",p?"paused":"active");ls.setItem("inkwellio-motion-paused",p?"1":"0");syncM(p);W.dispatchEvent(new Event("inkwellio:motion-change"));}catch{}}
D.addEventListener("click",function(e){var g=e.target&&e.target.closest?e.target:null,tb=g&&g.closest("[data-theme-toggle]"),mb=g&&g.closest("[data-motion-toggle]");if(tb){var nx=d.getAttribute("data-theme")==="dark"?"light":"dark";try{d.setAttribute("data-theme",nx);ls.setItem("inkwellio-theme",nx);}catch{}}else if(mb)setM(!pz());});
var IS='input,textarea,select,button,a,label,[role="tab"],.auth-field,.bento-pill-btn',FS='input,textarea,select,[contenteditable="true"]';
function init(){
syncM(pz());
var rq=W.matchMedia("(prefers-reduced-motion: reduce)");rq.addEventListener("change",function(){try{if(!ls.getItem("inkwellio-motion"))setM(rq.matches);}catch{}});
var fine=W.matchMedia("(hover: hover) and (pointer: fine)"),cs=getComputedStyle(D.body||d);
var nv=function(k,f){var n=parseFloat(cs.getPropertyValue(k));return Number.isFinite(n)?n:f;};
var ho=D.querySelector(".hero-stage-outer"),rb=D.querySelector(".hero-ribbon-media-box"),ht=D.querySelector("[data-tilt-hero]"),am=D.querySelector(".auth-main"),ac=D.querySelector("[data-tilt-auth]"),ab=D.querySelector("[data-auth-parallax]");
var sps=[].slice.call(qA("[data-spotlight]")),mgs=[].slice.call(qA("[data-magnetic],.nav-auth-pill,.auth-submit"));
var vw=W.innerWidth||1440,vh=W.innerHeight||900;
var mg=nv("--motion-gain",1),rS=nv("--hero-ribbon-shift",38),rR=nv("--hero-ribbon-rot",2),hM=nv("--hero-tilt-max",9),aM=nv("--auth-tilt-max",6),aS=nv("--auth-backdrop-shift",28),bM=nv("--bento-tilt-max",5),mM=nv("--magnetic-pull",8.5),mL=nv("--magnetic-label-pull",2);
var p={x:vw*.65,y:vh*.42,curX:vw*.65,curY:vh*.42,rx:0,ry:0,rrot:0,tx:0,ty:0,abx:0,aby:0,atx:0,aty:0,lastMoveAt:0,active:false,oc:false,hc:null,fc:false};
W.__inkwellioPointer=p;var wm=new WeakMap(),all=[].concat(ho||[],ht||[],am||[],ac||[],sps,mgs);
function inv(){vw=W.innerWidth||1440;vh=W.innerHeight||900;mg=nv("--motion-gain",1);for(var i=0;i<all.length;i++)wm.delete(all[i]);}
if(typeof ResizeObserver!=="undefined"&&all.length){var ro=new ResizeObserver(inv);for(var i=0;i<all.length;i++)ro.observe(all[i]);}
W.addEventListener("scroll",inv,{passive: true});W.addEventListener("resize",inv,{passive: true});
function gr(el){var r=wm.get(el);if(!r){r=el.getBoundingClientRect();wm.set(el,r);}return r;}
var rid=0,it=0,last=0,f2=function(v){return v.toFixed(2);};
function flat(tr){if(tr)d.classList.add("is-idle-flat");p.tx=p.ty=p.atx=p.aty=0;xy(ht,"--t",0,0,"");xy(ac,"--at",0,0,"");for(var i=0;i<sps.length;i++)xy(sps[i],"--s",0,0,"");}
function rst(tr){p.rx=p.ry=p.rrot=p.abx=p.aby=0;flat(tr);if(ho){xy(ho,"--m",0,0,"");ho.style.removeProperty("--spotlight-active");}if(am)am.style.removeProperty("--spotlight-active");xy(rb,"--r",0,0,"px");sv(rb,"--rrot","0deg");xy(ab,"--ab",0,0,"px");for(var i=0;i<sps.length;i++)xy(sps[i],"--spotlight-",-999,-999,"px");for(var m=0;m<mgs.length;m++){xy(mgs[m],"--mag-",0,0,"px");xy(mgs[m],"--mag-l",0,0,"px");}}
function sfc(){var ae=D.activeElement;p.fc=!!(ae&&ae.matches&&ae.matches(FS)&&((ht&&ht.contains(ae))||(ac&&ac.contains(ae))));if(p.fc)flat(true);}
D.addEventListener("focusin",sfc,{passive:true});D.addEventListener("focusout",function(){setTimeout(sfc,0);},{passive:true});
function tick(now){
rid=0;if(!fine.matches||pz()){p.active=false;rst(false);return;}
var dt=last?clamp(now-last,8,50):16.667;last=now;
var x=p.x,y=p.y,nx=clamp((x/(vw||1))*2-1,-1,1),ny=clamp((y/(vh||1))*2-1,-1,1);
var flt=p.fc||p.oc,tTx=0,tTy=0,tAtx=0,tAty=0,tRx=nx*rS*mg,tRy=ny*rS*mg,tRr=nx*rR*mg,tAbx=-nx*aS*mg,tAby=-ny*aS*mg;
if(ht&&!flt){var hr=gr(ht),oT=ho?gr(ho).top:hr.top-120,oB=ho?gr(ho).bottom:hr.bottom+120;if(y>=oT&&y<=oB){tTx=clamp(-ny*hM*.55*mg,-hM*mg,hM*mg);tTy=clamp(nx*hM*mg,-hM*mg,hM*mg);}}
if(ac&&!flt){tAtx=clamp(-ny*aM*.6*mg,-aM*mg,aM*mg);tAty=clamp(nx*aM*mg,-aM*mg,aM*mg);}
var pa=1-Math.pow(.88,dt/16.667),ta=1-Math.pow(flt?.66:.86,dt/16.667);
p.curX+=(x-p.curX)*pa;p.curY+=(y-p.curY)*pa;p.rx+=(tRx-p.rx)*pa;p.ry+=(tRy-p.ry)*pa;p.rrot+=(tRr-p.rrot)*pa;p.abx+=(tAbx-p.abx)*pa;p.aby+=(tAby-p.aby)*pa;p.tx+=(tTx-p.tx)*ta;p.ty+=(tTy-p.ty)*ta;p.atx+=(tAtx-p.atx)*ta;p.aty+=(tAty-p.aty)*ta;
if(ho){var or=gr(ho);xy(ho,"--m",nx.toFixed(4),ny.toFixed(4),"");xy(ho,"--cursor-",(p.curX-or.left).toFixed(1),(p.curY-or.top).toFixed(1),"px");sv(ho,"--spotlight-active","1");}
if(am){var ar=gr(am);xy(am,"--cursor-",(p.curX-ar.left).toFixed(1),(p.curY-ar.top).toFixed(1),"px");sv(am,"--spotlight-active","1");}
xy(rb,"--r",f2(p.rx),f2(p.ry),"px");sv(rb,"--rrot",f2(p.rrot)+"deg");xy(ab,"--ab",f2(p.abx),f2(p.aby),"px");xy(ht,"--t",f2(p.tx),f2(p.ty),"");xy(ac,"--at",f2(p.atx),f2(p.aty),"");
for(var i=0;i<sps.length;i++){var sp=sps[i],sr=gr(sp);xy(sp,"--spotlight-",(p.curX-sr.left).toFixed(1),(p.curY-sr.top).toFixed(1),"px");if(sp!==ac){if(sp===p.hc&&!p.oc&&sr.width>0)xy(sp,"--s",f2(clamp((y-(sr.top+sr.height*.5))/(sr.height*.5),-1,1)*-bM*.8*mg),f2(clamp((x-(sr.left+sr.width*.5))/(sr.width*.5),-1,1)*bM*mg),"");else xy(sp,"--s",0,0,"");}}
for(var j=0;j<mgs.length;j++){var b=mgs[j],mr=gr(b);if(x>=mr.left-24&&x<=mr.right+24&&y>=mr.top-24&&y<=mr.bottom+24&&mr.width>0){var dx=(x-(mr.left+mr.width*.5))/(mr.width*.5+24),dy=(y-(mr.top+mr.height*.5))/(mr.height*.5+24);xy(b,"--mag-",f2(clamp(dx*mM*mg,-mM*mg,mM*mg)),f2(clamp(dy*mM*mg,-mM*mg,mM*mg)),"px");xy(b,"--mag-l",f2(clamp(dx*mL*mg,-mL*mg,mL*mg)),f2(clamp(dy*mL*mg,-mL*mg,mL*mg)),"px");}else{xy(b,"--mag-",0,0,"px");xy(b,"--mag-l",0,0,"px");}}
var done=Math.abs(x-p.curX)<.3&&Math.abs(y-p.curY)<.3&&Math.abs(tTx-p.tx)<.04&&Math.abs(tTy-p.ty)<.04&&Math.abs(tAty-p.aty)<.04&&Math.abs(tRx-p.rx)<.1&&Math.abs(tAbx-p.abx)<.1;
if(!done)rid=requestAnimationFrame(tick);else{last=0;p.active=false;}
}
D.addEventListener("pointermove",function(e){if(e.pointerType==="touch"||!fine.matches||pz())return;d.classList.remove("is-idle-flat");var t=e.target&&e.target.closest?e.target:null;p.oc=!!(t&&t.closest(IS));p.hc=t?t.closest("[data-spotlight]"):null;p.x=e.clientX;p.y=e.clientY;p.lastMoveAt=performance.now();p.active=true;if(it)clearTimeout(it);it=setTimeout(function(){if(rid){cancelAnimationFrame(rid);rid=0;}last=0;p.active=false;flat(true);},1200);if(!rid)rid=requestAnimationFrame(tick);W.dispatchEvent(new Event("inkwellio:pointer-wake"));},{passive:true});
function stop(){if(it){clearTimeout(it);it=0;}if(rid){cancelAnimationFrame(rid);rid=0;}last=0;p.active=false;rst(true);}
W.addEventListener("inkwellio:motion-change",function(){if(pz())stop();else sfc();});
D.addEventListener("pointerleave",function(){if(it){clearTimeout(it);it=0;}if(rid){cancelAnimationFrame(rid);rid=0;}last=0;p.active=false;flat(true);},{passive:true});
}
if(D.readyState==="loading")D.addEventListener("DOMContentLoaded",init);else init();
})();

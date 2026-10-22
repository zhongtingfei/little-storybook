/* Independent story player. Content comes from a local package or bundled demo. */
(async () => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const paths = {
 lock:'M7 11V7a5 5 0 0 1 10 0v4M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm6 4v3',
 book:'M3 5c4-2 7-1 9 1v15c-3-2-6-3-9-1V5Zm18 0c-4-2-7-1-9 1v15c3-2 6-3 9-1V5Z',
 play:'m9 5 11 7-11 7V5Z',pause:'M8 5v14M16 5v14',arrow:'M4 12h16m-6-6 6 6-6 6',back:'M20 12H4m6-6-6 6 6 6',left:'m14 5-7 7 7 7',right:'m10 5 7 7-7 7',
 sound:'m11 4-6 5H2v6h3l6 5V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14',mute:'m11 4-6 5H2v6h3l6 5V4Zm5 5 5 6m0-6-5 6',repeat:'M20 8a8 8 0 1 0 1 7M20 3v5h-5',close:'m6 6 12 12M6 18 18 6',moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',heart:'M20.8 5.6a5.5 5.5 0 0 0-8 0L12 7l-.8-1.4a5.5 5.5 0 0 0-8 7.5L12 21l8.8-7.9a5.5 5.5 0 0 0 0-7.5Z',settings:'m9 3-.6 3-2.5 1.5L3 7l-1 4 2.5 2-.1 3L3 18l3 3 3-1 3 1 3-1 3 1 3-3-1.5-2 .1-3L22 11l-1-4-2.9.5L15.6 6 15 3H9Zm3 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6',hand:'M9 12V5a2 2 0 0 1 4 0v6m0-3a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v6c0 4-3 6-6 6h-2c-2 0-4-2-5-3l-5-5a2 2 0 0 1 3-3l3 3',leaf:'M20 3S3 1 3 12c0 8 9 9 13 4 4-4 4-13 4-13ZM4 20 16 8',check:'m5 12 4 4L20 5',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z',star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z'
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.star}"/></svg>`;
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
BookUI.initImport();
let book=null,loadError='';
try{book=await StoryPackages.current();}catch(error){loadError=error.message;}
if(!book){BookUI.empty(loadError);return;}
BookUI.paint(book);
const manifest=book.manifest;
document.body.classList.toggle('book-v2',manifest.schemaVersion===2);
let sceneView=null;
const scenes=manifest.pages.map(page=>({
 raw:page,
 title:page.title,narration:page.narration.text,narrationAudio:page.narration.audio,background:page.background,
 hints:page.steps.map(step=>step.hint),actors:page.actors.map(a=>[a.id,a.x,a.y]),actorMeta:Object.fromEntries(page.actors.map(a=>[a.id,a])),
 targets:page.steps.map(step=>[step.target,step.response.text,step.response.animation==='bounce'?'responding':step.response.animation]),
 responseAudio:page.steps.map(step=>step.response.audio)
}));
window.STORY_SCENES=scenes;

let params=new URLSearchParams(location.search);
const bounded=(v,lo,hi,fallback)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):fallback;
let soundBeforeMute={voice:true,bgm:false};
const settings={voice:params.get('voice')!=='off',bgm:params.get('bgm')==='on',hints:params.get('hints')!=='off',volume:params.has('vol')?bounded(params.get('vol'),0,100,75):75};
let current=bounded(params.get('p')||0,0,scenes.length-1,0)|0;
const withSettings=(file,page=current)=>{const u=new URL(file,location.href);u.search='';u.searchParams.set('p',page);u.searchParams.set('voice',settings.voice?'on':'off');u.searchParams.set('bgm',settings.bgm?'on':'off');u.searchParams.set('hints',settings.hints?'on':'off');u.searchParams.set('vol',settings.volume);return u.pathname.split('/').pop()+u.search+u.hash;};
function updateLinks(){$$('[data-preserve]').forEach(a=>a.href=withSettings(a.getAttribute('data-preserve'),a.dataset.page===undefined?current:Number(a.dataset.page)));}
updateLinks();
function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3200);}
class PausableTimer{
 start(fn,delay){this.clear();this.fn=fn;this.remaining=delay;this.paused=false;this.resume();}
 pause(){if(this.id){clearTimeout(this.id);this.id=null;this.remaining=Math.max(0,this.remaining-(performance.now()-this.started));}this.paused=true;}
 resume(){if(!this.fn||this.id)return;this.paused=false;this.started=performance.now();this.id=setTimeout(()=>{const fn=this.fn;this.fn=null;this.id=null;fn();},this.remaining);}
 clear(){clearTimeout(this.id);this.id=null;this.fn=null;this.paused=false;}
}
class Voice{
 constructor(onState=()=>{}){this.audio=new Audio();this.audio.preload='auto';this.fallback=new PausableTimer();this.startDelay=new PausableTimer();this.waiting=null;this.paused=false;this.version=0;this.attempt=0;this.onState=onState;}
 cancel(){this.version++;this.attempt++;this.recover=null;this.audio.pause();this.audio.onended=null;this.audio.onerror=null;this.audio.removeAttribute('src');this.fallback.clear();this.startDelay.clear();this.onState(false);if(this.waiting){this.waiting(false);this.waiting=null;}}
 play(file,text,delay=0){
  this.cancel();this.paused=false;this.audio.volume=settings.volume/100;this.audio.muted=!settings.voice;
  const version=this.version;
  return new Promise(resolve=>{
   this.waiting=resolve;
   const done=()=>{if(version!==this.version||!this.waiting)return;const r=this.waiting;this.waiting=null;this.recover=null;this.fallback.clear();this.startDelay.clear();this.onState(false);r(true);};
   let fallbackStarted=false;
   const fallback=()=>{if(version!==this.version||fallbackStarted||!this.waiting)return;fallbackStarted=true;this.audio.pause();this.onState(!this.paused);this.fallback.start(done,Math.max(1800,text.length*165));if(this.paused)this.fallback.pause();const n=$('#sound-notice');if(n)n.hidden=false;};
   this.recover=fallback;
   this.audio.onended=done;this.audio.onerror=fallback;
   const begin=()=>{
    if(version!==this.version||!this.waiting)return;
    this.onState(!this.paused);
    if(!file){this.fallback.start(done,Math.max(1800,text.length*130));if(this.paused)this.fallback.pause();return;}
    this.audio.src=file;
    const attempt=++this.attempt;
    this.audio.play().then(()=>{if(version===this.version&&attempt===this.attempt){const n=$('#sound-notice');if(n)n.hidden=true;}}).catch(()=>{if(version!==this.version||attempt!==this.attempt||this.paused)return;fallback();});
   };
   if(delay>0)this.startDelay.start(begin,delay);else begin();
  });
 }
 pause(){this.paused=true;this.attempt++;this.audio.pause();this.fallback.pause();this.startDelay.pause();this.onState(false);}
 resume(){this.paused=false;if(this.startDelay.fn)this.startDelay.resume();else if(this.waiting){this.onState(true);if(this.fallback.fn)this.fallback.resume();else {const version=this.version,attempt=++this.attempt;this.audio.play().catch(()=>{if(version===this.version&&attempt===this.attempt&&!this.paused)this.recover?.();});}}}
 sync(){this.audio.muted=!settings.voice;this.audio.volume=settings.volume/100;}
}
const voice=new Voice(value=>sceneView?.setSpeaking?.(value));
let audioContext,bgmBus,bgmOsc=[];
function syncBgm(){try{if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();bgmBus=audioContext.createGain();bgmBus.gain.value=0;bgmBus.connect(audioContext.destination);[174.61,261.63,349.23].forEach((freq,i)=>{let o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;g.gain.value=[.42,.14,.07][i];o.connect(g);g.connect(bgmBus);o.start();bgmOsc.push(o);});}audioContext.resume().catch(()=>{});bgmBus.gain.setTargetAtTime(settings.bgm&&!paused?settings.volume/100*.055:0,audioContext.currentTime,.5);}catch(e){/* Optional ambient tone. */}}
function chime(){if(!settings.voice||!settings.volume)return;try{if(!audioContext)syncBgm();[659.25,783.99].forEach((f,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=f;g.gain.setValueAtTime(0,audioContext.currentTime);g.gain.linearRampToValueAtTime(.035*settings.volume/100,audioContext.currentTime+.03+i*.12);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.5+i*.12);o.connect(g);g.connect(audioContext.destination);o.start(audioContext.currentTime+i*.12);o.stop(audioContext.currentTime+.7+i*.12);});}catch(e){}}
let phase='idle',paused=false,sequence=0,targetIndex=0,completed=false,started=false,dialogWasPaused=false;
let reminder=new PausableTimer(),settle=new PausableTimer();
const stage=$('#stage');
let storyLock=null;
function syncSettings(){voice.sync();sceneView?.sync(settings);document.body.classList.toggle('hint-off',!settings.hints);$$('[data-setting]').forEach(el=>{const k=el.dataset.setting;if(el.type==='checkbox')el.checked=settings[k];else el.value=settings[k];});$$('[data-volume-label]').forEach(el=>el.textContent=settings.volume+'%');const mute=$('#mute-btn');if(mute){const soundOn=settings.voice||settings.bgm;mute.innerHTML=icon(soundOn?'sound':'mute')+`<span>${soundOn?'声音开启':'声音关闭'}</span>`;mute.setAttribute('aria-pressed',String(!soundOn));}updateLinks();if(audioContext)syncBgm();}
$$('[data-setting]').forEach(el=>el.addEventListener('input',()=>{settings[el.dataset.setting]=el.type==='checkbox'?el.checked:Number(el.value);syncSettings();if(el.dataset.setting==='bgm')syncBgm();}));
syncSettings();
function caption(text,label='故事旁白'){if(!$('#caption-text'))return;$('#caption-text').textContent=text;$('#caption-label').textContent=label;sceneView?.caption(text,label);}
function instruction(text){if($('#instruction'))$('#instruction').textContent=text;}
function target(){const t=scenes[current].targets[Math.min(targetIndex,scenes[current].targets.length-1)];return $(`[data-actor="${t[0]}"]`,stage);}
function clearGuide(){$$('.actor',stage).forEach(a=>a.classList.remove('target'));reminder.clear();}
function guide(){if(paused||phase!=='waiting')return;clearGuide();const el=target();if(el)el.classList.add('target');instruction(scenes[current].hints[Math.min(targetIndex,scenes[current].hints.length-1)]);reminder.start(()=>{if(phase!=='waiting'||paused)return;instruction('不着急，试着点一点亮着的朋友吧');const t=target();if(t){t.classList.add('explore');settle.start(()=>t.classList.remove('explore'),700);}},8500);}
function render(){
 sceneView?.dispose();sceneView=null;stage.classList.remove('storybook-v2');
 const s=scenes[current];stage.dataset.scene=current;
 stage.innerHTML='<div class="forest-layer"></div><div class="stage-vignette"></div><div class="actor-layer"></div><div class="scene-label"><span id="scene-label-number"></span><span>/</span><span id="scene-label-title"></span></div><div class="scene-hint">轻轻点，慢慢听</div><div id="speech" class="speech-bubble" aria-live="polite" hidden></div><div id="pause-cover" class="pause-cover" hidden><button id="resume-stage" aria-label="继续阅读"><span class="play-circle">'+icon('play')+'</span>故事在等你</button></div>';
 $('.forest-layer',stage).style.backgroundImage=`url("${book.url(s.background)}")`;
 $('#scene-label-number').textContent=String(current+1).padStart(2,'0');$('#scene-label-title').textContent=s.title;
 if(manifest.schemaVersion===2&&window.createStorySceneV2){sceneView=window.createStorySceneV2({stage,page:s.raw,book,onInteract:interact,settings});}
 else for(const [id,x,y] of s.actors){
  const meta=s.actorMeta[id],button=document.createElement('button');button.className='actor';button.dataset.actor=id;
  button.style.setProperty('--x',x+'%');button.style.setProperty('--y',y+'%');button.style.setProperty('--actor-width',meta.width+'%');button.style.setProperty('--actor-ratio',meta.aspectRatio);
  button.setAttribute('aria-label',meta.name+'，点击互动');const halo=document.createElement('span');halo.className='halo';button.append(halo,BookUI.image(book.url(meta.image)));
  button.addEventListener('click',()=>interact(id));$('.actor-layer',stage).appendChild(button);
 }
 if(!sceneView)for(let i=0;i<8;i++){const f=document.createElement('span');f.className='firefly';f.style.cssText=`left:${12+i*11}%;top:${45+(i*17)%40}%;animation-delay:-${i*.6}s`;stage.appendChild(f);}
 $('#resume-stage').addEventListener('click',()=>setPaused(false));$('#page-count').textContent=String(current+1).padStart(2,'0')+' / '+String(scenes.length).padStart(2,'0');
 $('#prev-page').disabled=current===0;$('#next-page').setAttribute('aria-label',current===scenes.length-1?'读完故事':'下一页');
 $('#dots').replaceChildren();const first=Math.max(0,Math.min(current-5,scenes.length-12));
 for(let i=first;i<Math.min(scenes.length,first+12);i++){const a=document.createElement('a');a.href=withSettings('read.html',i);a.className=i===current?'active':i<current?'done':'';a.setAttribute('aria-label','第 '+(i+1)+' 页：'+scenes[i].title);if(i===current)a.setAttribute('aria-current','step');a.addEventListener('click',e=>{e.preventDefault();go(i);});$('#dots').appendChild(a);}
 updateLinks();
}
async function narrate(){if(audioContext)syncBgm();const ticket=++sequence;voice.cancel();sceneView?.reset();clearGuide();settle.clear();phase='narrating';completed=false;targetIndex=0;$$('.actor',stage).forEach(a=>a.classList.remove('responding','fly','lift','drift'));$('#speech').hidden=true;caption(scenes[current].narration);instruction('先听一听，故事就要开始了');document.body.classList.add('is-speaking');const ok=await voice.play(book.url(scenes[current].narrationAudio),scenes[current].narration);if(!ok||ticket!==sequence)return;document.body.classList.remove('is-speaking');phase='waiting';$('#caption-label').textContent='轮到你啦';guide();}
async function interact(type){
 if(!started||paused||phase==='transition'||phase==='responding'||phase==='narrating')return;
 const el=$(`[data-actor="${type}"]`,stage);if(!el)return;
 const s=scenes[current],index=Math.min(targetIndex,s.targets.length-1),t=s.targets[index],step=s.raw.steps[index];
 if(type!==t[0]){el.classList.remove('explore');void el.offsetWidth;el.classList.add('explore');return;}
 clearGuide();phase='responding';const ticket=++sequence;
 const effect=sceneView&&step.response.action?sceneView.play(step):Promise.resolve(true);
 if(!step.response.action){el.classList.remove(t[2]);void el.offsetWidth;el.classList.add(t[2]);}
 const bubble=$('#speech');bubble.textContent=t[1];bubble.hidden=false;
 caption(t[1],(step.response.speaker||s.actorMeta[type].name)+'说');instruction('听听它说了什么');document.body.classList.add('is-speaking');
 const [ok,effectOk]=await Promise.all([voice.play(book.url(s.responseAudio[index]),t[1],step.response.voiceDelay||0),effect]);
 if(!ok||!effectOk||ticket!==sequence)return;
 document.body.classList.remove('is-speaking');if(!sceneView)chime();bubble.hidden=true;
 if(!completed&&targetIndex<s.targets.length-1){targetIndex++;phase='waiting';$('#caption-label').textContent='轮到你啦';guide();}
 else{completed=true;phase='ready';$('#caption-label').textContent='这一页读完啦';instruction(current===scenes.length-1?'点右边的箭头，读完这本故事':'可以再点一次听听，或点右边的箭头翻页');}
}
function resetTasks(){sequence++;voice.cancel();sceneView?.cancel();reminder.clear();settle.clear();document.body.classList.remove('is-speaking');}
function go(page,fromHistory=false){
 if(page<0||phase==='transition'||storyLock?.blocked)return;
 if(page>=scenes.length){resetTasks();if(storyLock?.active){phase='ended';storyLock.finish();}else location.href=withSettings('end.html');return;}
 storyLock?.resetEnd();resetTasks();current=page;paused=false;document.body.classList.remove('all-paused');
 $('#pause-btn').innerHTML=icon('pause')+'<span>暂停</span>';$('#pause-btn').setAttribute('aria-pressed','false');
 phase='transition';render();stage.classList.add('turn-animation');
 if(!fromHistory){try{history.pushState({p:current},'',withSettings('read.html'));}catch(e){}}
 settle.start(()=>{stage.classList.remove('turn-animation');phase='idle';if(started)narrate();else showStart();},500);
}
function showStart(){
 sceneView?.pause();
 caption(scenes[current].narration);instruction('进入全屏故事后，只保留故事互动和翻页');
 $('#pause-cover').hidden=false;$('#resume-stage').setAttribute('aria-label','全屏进入故事');
 $('#resume-stage').innerHTML=`<span class="play-circle">${icon('play')}</span>全屏进入故事`;
}
async function startPlayback(){
 sceneView?.resume();
 started=true;paused=false;$('#pause-cover').hidden=true;syncBgm();
 if(params.get('cover')==='1'){
  params.delete('cover');const ticket=++sequence;phase='narrating';caption(manifest.title,'故事开始了');instruction('故事已经锁定，一起出发吧');
  const ok=await voice.play(book.url(manifest.cover.audio),manifest.title);if(!ok||ticket!==sequence)return;
 }
 narrate();
}
function setPaused(value){
 if(!started){if(!value)storyLock?.enter();return;}
 if(!value&&(storyLock?.finished||!storyLock?.canResume()))return;
 paused=value;document.body.classList.toggle('all-paused',paused);$('#pause-cover').hidden=!paused;
 $('#resume-stage').setAttribute('aria-label','继续阅读');$('#resume-stage').innerHTML=`<span class="play-circle">${icon('play')}</span>故事在等你`;
 $('#pause-btn').innerHTML=icon(paused?'play':'pause')+`<span>${paused?'继续':'暂停'}</span>`;$('#pause-btn').setAttribute('aria-pressed',String(paused));
 if(paused){voice.pause();sceneView?.pause();reminder.pause();settle.pause();}else{voice.resume();sceneView?.resume();reminder.resume();settle.resume();}if(audioContext)syncBgm();
}
function openReading(){
 $$('#start-story,.book').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();location.href=withSettings('read.html',0)+'&cover=1';}));
}
openReading();
if(manifest.schemaVersion===2&&document.querySelector('#ending-restart'))document.querySelector('#ending-restart').innerHTML=icon('repeat')+'再听一次';
window.addEventListener('pagehide',()=>sceneView?.dispose());
if(stage){
 render();const dialog=$('#parent-dialog');
 const openParents=()=>{dialogWasPaused=paused;if(started&&!paused)setPaused(true);$('#parent-replay').disabled=Boolean(started&&!storyLock.canResume());$('#restart-story').disabled=Boolean(started&&!storyLock.canResume());$('#parent-page-text').textContent=scenes[current].narration+' '+scenes[current].targets.map(t=>t[1]).join(' ');dialog.showModal();};
 storyLock=window.createStoryLock({hasStarted:()=>started,onStart:startPlayback,onPause:()=>setPaused(true),onResume:()=>setPaused(false),onUnlock:openParents,
  onRestart:()=>go(0),onExit:()=>{dialogWasPaused=true;resetTasks();paused=true;if(audioContext)syncBgm();},onLeave:()=>{location.href=withSettings('index.html');}});
 $('#parent-button').addEventListener('click',openParents);
 dialog.addEventListener('close',()=>{if(started&&!dialogWasPaused&&storyLock.canResume())setPaused(false);});
 $$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>{if(b.classList.contains('btn-primary'))dialogWasPaused=false;dialog.close();}));
 $('#pause-btn').addEventListener('click',()=>setPaused(!paused));
 $('#replay-btn').addEventListener('click',()=>{if(!started){storyLock.enter();return;}setPaused(false);narrate();});
 $('#parent-replay').addEventListener('click',()=>{if(storyLock.blocked)return;dialogWasPaused=true;dialog.close();if(!started){storyLock.enter();return;}if(storyLock.finished){go(0);return;}setPaused(false);narrate();});
 $('#mute-btn').addEventListener('click',()=>{if(settings.voice||settings.bgm){soundBeforeMute={voice:settings.voice,bgm:settings.bgm};settings.voice=false;settings.bgm=false;}else{settings.voice=soundBeforeMute.voice;settings.bgm=soundBeforeMute.bgm;}syncSettings();});
 $('#prev-page').addEventListener('click',()=>go(current-1));$('#next-page').addEventListener('click',()=>go(current+1));
 $('#restart-story').addEventListener('click',()=>{dialogWasPaused=true;dialog.close();go(0);});
 window.addEventListener('popstate',()=>{const u=new URLSearchParams(location.search);go(bounded(u.get('p')||0,0,scenes.length-1,0)|0,true);});
 let touchStart=null;stage.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
 stage.addEventListener('pointerup',e=>{if(!touchStart||e.pointerId!==touchStart.id)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6&&!paused&&started)go(current+(dx<0?1:-1));});
 stage.addEventListener('pointercancel',()=>touchStart=null);
 document.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(dialog.open||storyLock.blocked||storyLock.finished||['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable)return;
  if(e.code==='Space'&&!storyLock.locked&&!['BUTTON','A'].includes(tag)){e.preventDefault();setPaused(!paused);}
  if(e.key==='ArrowRight'&&started){e.preventDefault();go(current+1);}if(e.key==='ArrowLeft'&&started){e.preventDefault();go(current-1);}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!paused)setPaused(true);});
 showStart();
}
if($('#chapter-list')){
 for(const [i,s] of scenes.entries()){
  const details=document.createElement('details');details.open=i===0;const summary=document.createElement('summary');summary.textContent=String(i+1).padStart(2,'0')+'　'+s.title;
  const p=document.createElement('p');p.textContent=s.narration+' '+s.targets.map(t=>t[1]).join(' ');
  const link=document.createElement('a');link.className='chapter-link';link.dataset.preserve='read.html';link.dataset.page=i;link.href=withSettings('read.html',i);link.textContent='体验这一页 →';details.append(summary,p,link);$('#chapter-list').appendChild(details);
 }
 $('#apply-settings').addEventListener('click',event=>{event.preventDefault();location.href=withSettings('read.html');});
}
const flows=[
 ['打开一本故事','进入全屏，自动锁定','打开封面后，点击「全屏进入故事」。画面铺满屏幕，先听故事名称，再进入第一个场景；导航和工具栏会隐藏。',['全屏阅读','默认锁定','本地声音'],'index.html','bear'],
 ['先听，再看见提示','旁白结束，光圈轻轻出现','一段旁白只讲一件事。旁白结束后，只让当前目标出现呼吸光圈，给孩子观察与尝试的时间。',['一个明确目标','大面积热区','温和提醒'],'read.html?p=0','bear'],
 ['点一点，朋友回应','动作、声音、对白同步反馈','点中角色后，它会轻轻动一下，再说一句话。连续点击不会叠加对白；点到其他物体时只给轻微回应。',['单一人声','允许重复点击','误触无惩罚'],'read.html?p=2','rabbit'],
 ['翻到下一页','点箭头，或者轻轻滑动','一页故事结束后，可重听对白，也可按大箭头继续。支持左右滑动和键盘方向键；每次翻页会清理上一页声音。',['约 0.5 秒翻页','支持手势','保留返回路径'],'read.html?p=5','star'],
 ['让故事等一等','长按小锁，打开家长控制','长按右上角小锁 2 秒，故事暂停并打开家长面板。可调音量、重听、查看文字或退出；关闭面板后重新锁定。',['短按不解锁','中断会清零','退出全屏即暂停'],'read.html','moon'],
 ['故事读完啦','结束后，仍留在故事里','读完后保留全屏和锁定，可直接重读。离开故事需长按小锁，在家长面板选择退出。',['结束仍锁定','可重新读','家长解锁后退出'],'read.html?p=7','star']
];
const dialoguePage=Math.max(0,scenes.findIndex(s=>s.targets.length===2));
flows[2][4]=withSettings('read.html',dialoguePage);flows[3][4]=withSettings('read.html',Math.min(5,scenes.length-1));flows[5][4]=withSettings('read.html',scenes.length-1);
if($('#flow-nav')){let step=0;const paint=()=>{const f=flows[step];$('#flow-nav').innerHTML=flows.map((x,i)=>`<button class="flow-choice ${i===step?'active':''}" data-step="${i}" aria-pressed="${i===step}"><span>${String(i+1).padStart(2,'0')}</span><div><h3>${x[0]}</h3><p>${x[1]}</p></div></button>`).join('');$('#flow-preview').replaceChildren();const preview=document.createElement('div');preview.className='demo-actor';preview.appendChild(BookUI.image(book.url(manifest.cover.layers[0]?.image||manifest.cover.background)));$('#flow-preview').appendChild(preview);$('#flow-title').textContent=f[0];$('#flow-description').textContent=f[2];$('#flow-meta').innerHTML=f[3].map(t=>'<span>'+t+'</span>').join('');$('#flow-counter').textContent=`${String(step+1).padStart(2,'0')} / 06`;$('#flow-open').href=f[4];$('#flow-prev').disabled=step===0;$('#flow-next').disabled=step===5;$$('[data-step]').forEach(b=>b.addEventListener('click',()=>{step=Number(b.dataset.step);paint();}));};$('#flow-prev').onclick=()=>{step=Math.max(0,step-1);paint();};$('#flow-next').onclick=()=>{step=Math.min(5,step+1);paint();};paint();}
$$('[data-scenario]').forEach((b,i)=>b.addEventListener('click',()=>{const page=[0,dialoguePage,Math.max(0,scenes.length-2),scenes.length-1][i]||0;location.href=withSettings('read.html',page)+(i===2?'&voice=off':'');}));
window.addEventListener('pagehide',()=>{resetTasks();if(audioContext)audioContext.suspend().catch(()=>{});});
})().catch(error=>{console.error('Player initialization failed:',error.message);window.BookUI?.empty('播放器暂时无法打开，请返回首页重新导入故事本。');});

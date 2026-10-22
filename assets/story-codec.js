/* Pure, declarative story-package validation; shared by browser worker and tests. */
(function(root){
 'use strict';
 const LIMITS={zip:64*1024*1024,total:128*1024*1024,file:32*1024*1024,count:512,json:2*1024*1024,pages:100};
 const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',m4a:'audio/mp4'};
 const ANIMATIONS=new Set(['bounce','lift','fly','drift']);
 const ACTIONS=new Set(['rain-start','ears-blink','umbrella-open','rain-tap','splash','walk','rain-stop','umbrella-close']);
 const ROLES=new Set(['rabbit','cloud','sun','puddle','raindrop','umbrella','image']);
 const UNSAFE_KEYS=new Set(['__proto__','prototype','constructor']);
 const fail=message=>{throw new Error(message);};
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 function path(value,label='资源路径'){
  if(typeof value!=='string'||!value||value.length>240||/[:?#%\\\x00-\x1f]/.test(value)||value.startsWith('/')||value.split('/').some(x=>!x||x==='.'||x==='..'||['__proto__','prototype','constructor'].includes(x)))fail(label+'必须是故事包内的相对路径');
  return value;
 }
 function text(value,label,max=600){if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+'缺失或过长');return value.trim();}
 function optionalText(value,label,max=600){return value===undefined||value===null||value===''?'':text(value,label,max);}
 function id(value,label){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))fail(label+'只能包含字母、数字、下划线和短横线');return value;}
 function number(value,label,min,max,fallback){if(value===undefined&&fallback!==undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(label+'超出允许范围');return value;}
 function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(label+'必须是对象');return value;}
 function list(value,label,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)fail(label+'数量必须在 '+min+'–'+max+' 之间');return value;}
 function hitArea(value,label){const a=object(value,label);const area={x:number(a.x,label+'横坐标',0,100),y:number(a.y,label+'纵坐标',0,100),width:number(a.width,label+'宽度',Number.MIN_VALUE,100),height:number(a.height,label+'高度',Number.MIN_VALUE,100)};if(area.x+area.width>100||area.y+area.height>100)fail(label+'越界');return area;}
 const ext=name=>name.split('.').pop().toLowerCase();
 function checkMedia(name,data){
  if(!(data instanceof Uint8Array)||!data.length||data.length>LIMITS.file)fail('资源为空或过大：'+name);
  const type=ext(name),prefix=String.fromCharCode(...data.subarray(0,16));
  if(type==='svg'){
   const svg=new TextDecoder('utf-8',{fatal:true}).decode(data);
   if(!/<svg[\s>]/i.test(svg)||/<(?:[^\s<>/:]+:)?(?:script|foreignObject|iframe|object|embed|image|use|a|style|animate|animateMotion|animateTransform|animateColor|set|discard)\b/i.test(svg)||/<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|\b(?:href|src)\s*=/i.test(svg))fail('SVG 只能包含静态图形：'+name);
   for(const match of svg.matchAll(/url\s*\(([^)]*)\)/gi)){if(!match[1].trim().replace(/^['"]|['"]$/g,'').startsWith('#'))fail('SVG 不得引用外部资源：'+name);}
  }else if(type==='png'&&!(data[0]===137&&prefix.slice(1,4)==='PNG'))fail('PNG 图片格式不正确：'+name);
  else if(['jpg','jpeg'].includes(type)&&!(data[0]===255&&data[1]===216&&data[2]===255))fail('JPEG 图片格式不正确：'+name);
  else if(type==='webp'&&!(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP'))fail('WEBP 图片格式不正确：'+name);
  else if(type==='gif'&&!/^GIF8[79]a/.test(prefix))fail('GIF 图片格式不正确：'+name);
  else if(type==='wav'&&!(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WAVE'))fail('WAV 音频格式不正确：'+name);
  else if(type==='ogg'&&!prefix.startsWith('OggS'))fail('OGG 音频格式不正确：'+name);
  else if(type==='m4a'&&prefix.slice(4,8)!=='ftyp')fail('M4A 音频格式不正确：'+name);
  else if(type==='mp3'&&!(prefix.startsWith('ID3')||(data[0]===255&&(data[1]&224)===224)))fail('MP3 音频格式不正确：'+name);
 }
 function validate(input,files){
  object(input,'story.json');if(input.schemaVersion!==1&&input.schemaVersion!==2)fail('不支持的故事版本，请使用 schemaVersion: 1 或 2');
  const v2=input.schemaVersion===2;
  function v2Only(value,keys,label){if(!v2)for(const key of keys)if(own(value,key))fail(label+'字段 '+key+' 需要 schemaVersion: 2（v2）');}
  v2Only(input,['presentation'],'故事');
  function asset(value,label,kind,optional=false){if(optional&&(value===undefined||value===null||value===''))return null;const name=path(value,label);if(!own(files,name))fail(label+'找不到文件：'+name);const mime=MIME[ext(name)];if(!mime||!mime.startsWith(kind+'/'))fail(label+'文件类型不正确');return name;}
  function audioText(value,label){object(value,label);return {text:text(value.text,label+'文字'),audio:asset(value.audio,label+'音频','audio',true)};}
  function layer(value,label){object(value,label);return {image:asset(value.image,label+'图片','image'),x:number(value.x,label+'横坐标',0,100,50),y:number(value.y,label+'纵坐标',0,100,65),width:number(value.width,label+'宽度',5,60,20),aspectRatio:number(value.aspectRatio,label+'宽高比',.3,4,.8)};}
  const cover=object(input.cover,'封面');const ending=object(input.ending,'结尾');const pageIds=new Set();
  const normalized={schemaVersion:input.schemaVersion,id:id(input.id,'故事ID'),title:text(input.title,'书名',80),subtitle:optionalText(input.subtitle,'副标题',120),description:optionalText(input.description,'简介'),goal:optionalText(input.goal,'内容主题'),
   cover:{background:asset(cover.background,'封面背景','image'),layers:list(cover.layers||[],'封面图层',0,6).map((x,i)=>layer(x,'封面图层'+(i+1))),audio:asset(cover.audio,'故事名称音频','audio',true)},
   ending:{title:text(ending.title,'结束标题',120),text:text(ending.text,'结束语',300),image:asset(ending.image,'结束插画','image',true)},pages:[]};
  if(v2&&own(input,'presentation')){const p=object(input.presentation,'故事呈现');if(p.style!=='storybook'||p.aspectRatio!==1.5)fail('故事呈现只支持 style: storybook、aspectRatio: 1.5');normalized.presentation={style:'storybook',aspectRatio:1.5};}
  normalized.pages=list(input.pages,'故事页',1,LIMITS.pages).map((page,index)=>{
   const label='第'+(index+1)+'页';object(page,label);const pageId=id(page.id,label+'ID');if(pageIds.has(pageId))fail('故事页ID重复：'+pageId);pageIds.add(pageId);
   v2Only(page,['scene'],label);
   let scene;
   if(v2&&own(page,'scene')){
    object(page.scene,label+'场景');if(!['dry','rain'].includes(page.scene.weather))fail(label+'场景天气必须为 dry 或 rain');if(typeof page.scene.sunVisible!=='boolean')fail(label+'场景太阳显示状态必须为布尔值');scene={weather:page.scene.weather,sunVisible:page.scene.sunVisible};if(own(page.scene,'clearBackground'))scene.clearBackground=asset(page.scene.clearBackground,label+'晴天背景','image');
    if(own(page.scene,'ambience')){
     const ambience=object(page.scene.ambience,label+'环境声'),when=ambience.when===undefined?'always':ambience.when;
     if(when!=='rain'&&when!=='always')fail(label+'环境声播放时机 when 必须为 rain 或 always');
     scene.ambience={audio:asset(ambience.audio,label+'环境声音频','audio'),volume:number(ambience.volume,label+'环境声音量',0,1,.16),when};
    }
   }
   const actorIds=new Set();const actors=list(page.actors,label+'角色',1,8).map((actor,i)=>{
    object(actor,label+'角色');v2Only(actor,['height','variants','initialVariant','hitArea','hitAreas','role'],label+'角色');
    const actorId=id(actor.id,label+'角色ID');if(actorIds.has(actorId))fail(label+'角色ID重复：'+actorId);actorIds.add(actorId);
    const result={...layer(actor,label+'角色'+(i+1)),id:actorId,name:text(actor.name,label+'角色名称',40)};
    if(v2){
     if(own(actor,'height'))result.height=number(actor.height,label+'角色高度',5,95);
     if(own(actor,'role')){if(!ROLES.has(actor.role))fail(label+'角色语义不受支持');result.role=actor.role;}
     if(own(actor,'variants')){
      object(actor.variants,label+'角色变体');const entries=Object.entries(actor.variants);if(entries.length<1||entries.length>8)fail(label+'角色变体数量必须在 1–8 之间');
      result.variants=Object.create(null);for(const [key,value] of entries){if(UNSAFE_KEYS.has(key)||!/^[a-zA-Z0-9_-]{1,64}$/.test(key))fail(label+'角色变体名称只能使用安全的字母、数字、下划线和短横线');result.variants[key]=asset(value,label+'角色变体 '+key,'image');}
     }
     if(own(actor,'initialVariant')){if(typeof actor.initialVariant!=='string'||!result.variants||!own(result.variants,actor.initialVariant))fail(label+'角色初始变体必须存在于 variants');result.initialVariant=actor.initialVariant;}
     if(own(actor,'hitArea'))result.hitArea=hitArea(actor.hitArea,label+'点击区域');
     if(own(actor,'hitAreas')){
      object(actor.hitAreas,label+'变体点击区域');const entries=Object.entries(actor.hitAreas);if(entries.length<1||entries.length>8)fail(label+'变体点击区域数量必须在 1–8 之间');
      result.hitAreas=Object.create(null);for(const [key,value] of entries){if(UNSAFE_KEYS.has(key)||!/^[a-zA-Z0-9_-]{1,64}$/.test(key))fail(label+'变体点击区域名称只能使用安全的字母、数字、下划线和短横线');if(!result.variants||!own(result.variants,key))fail(label+'点击区域必须引用已存在的角色变体：'+key);result.hitAreas[key]=hitArea(value,label+'变体点击区域 '+key);}
     }
    }
    return result;
   });
   const steps=list(page.steps,label+'互动步骤',1,2).map((step,i)=>{
    object(step,label+'互动步骤');const target=id(step.target,label+'互动目标');if(!actorIds.has(target))fail(label+'互动目标不存在：'+target);
    const raw=object(step.response,label+'对白'+(i+1));v2Only(raw,['action','duration','sound','speaker','distanceX','voiceDelay','soundVolume'],label+'回应');const response=audioText(raw,label+'对白'+(i+1));const hasAction=v2&&own(raw,'action');
    if(hasAction){
     if(!ACTIONS.has(raw.action))fail(label+'使用了不支持的动作：'+raw.action);response.action=raw.action;
     const targetActor=actors.find(actor=>actor.id===target),variants=targetActor.variants;
     if(['umbrella-open','umbrella-close'].includes(raw.action)&&(!variants||!own(variants,'open')||!own(variants,'closed')))fail(label+'雨伞动作的目标必须提供 open 和 closed 变体');
     if(raw.action==='ears-blink'&&(!variants||!own(variants,'ears-blink')))fail(label+'抖耳眨眼动作的目标必须提供 ears-blink 变体');
     if(raw.action==='walk'&&(!variants||!own(variants,'walk-left')||!own(variants,'walk-right')))fail(label+'行走动作的目标必须提供 walk-left 和 walk-right 变体');
     if(['rain-start','rain-stop'].includes(raw.action)&&!scene)fail(label+'天气动作必须提供初始场景 scene');
     if(raw.action==='rain-stop'&&!actors.some(actor=>actor.role==='sun'||actor.id==='sun'))fail(label+'雨停动作必须有太阳图层（role: sun 或 id: sun）');
    }
    if(!hasAction||own(raw,'animation')){const animation=v2&&own(raw,'animation')?raw.animation:(raw.animation||'bounce');if(!ANIMATIONS.has(animation))fail(label+'使用了不支持的动作：'+animation);response.animation=animation;}
    if(v2){
     if(hasAction||own(raw,'duration'))response.duration=number(raw.duration,label+'动作时长',100,5000,1400);
     if(hasAction||own(raw,'sound'))response.sound=asset(raw.sound,label+'动作音效','audio',true);
     if(own(raw,'speaker'))response.speaker=text(raw.speaker,label+'对白署名',40);
     if(hasAction||own(raw,'distanceX'))response.distanceX=number(raw.distanceX,label+'行走横向距离',-20,20,8);
     if(own(raw,'voiceDelay')){const delay=number(raw.voiceDelay,label+'对白延迟',0,4000);if(!Number.isInteger(delay))fail(label+'对白延迟必须为 0–4000 的整数毫秒');response.voiceDelay=delay;}
     if(own(raw,'soundVolume'))response.soundVolume=number(raw.soundVolume,label+'音效音量',0,1);
    }
    return {target,hint:text(step.hint,label+'互动提示',160),response};
   });
   return {id:pageId,title:text(page.title,label+'标题',80),background:asset(page.background,label+'背景','image'),narration:audioText(page.narration,label+'旁白'),actors,steps,...(scene?{scene}:{})};
  });
  return normalized;
 }
 function collectAssetPaths(manifest,kind){
  if(kind!==undefined&&kind!=='image'&&kind!=='audio')fail('资源枚举类型必须为 image 或 audio');
  const names=new Set();
  function add(value){if(value===undefined||value===null||value==='')return;const name=path(value);if(!kind||MIME[ext(name)]?.startsWith(kind+'/'))names.add(name);}
  const items=value=>Array.isArray(value)?value:[];
  add(manifest.cover?.background);add(manifest.cover?.audio);for(const layer of items(manifest.cover?.layers))add(layer.image);add(manifest.ending?.image);
  for(const page of items(manifest.pages)){add(page.background);add(page.scene?.clearBackground);add(page.scene?.ambience?.audio);add(page.narration?.audio);for(const actor of items(page.actors)){add(actor.image);if(actor.variants&&typeof actor.variants==='object'&&!Array.isArray(actor.variants))for(const value of Object.values(actor.variants))add(value);}for(const step of items(page.steps)){add(step.response?.audio);add(step.response?.sound);}}
  return [...names];
 }
 function decode(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>LIMITS.zip)fail('故事包不能超过 64 MiB');
  let reported=0,count=0;const seen=new Set();let all;
  try{all=root.fflate.unzipSync(bytes,{filter(file){
   if(file.name.endsWith('/'))return false;
   if(++count>LIMITS.count)fail('故事包文件数量过多');
   path(file.name,'包内文件名');if(seen.has(file.name))fail('包内文件名重复：'+file.name);seen.add(file.name);
   if(!Number.isSafeInteger(file.originalSize)||file.originalSize<0||file.originalSize>LIMITS.file)fail('包内文件过大：'+file.name);
   reported+=file.originalSize;if(reported>LIMITS.total)fail('故事包解压后不能超过 128 MiB');
   if(file.name.split('/').pop()==='.DS_Store'||file.name.startsWith('__MACOSX/'))return false;
   const e=ext(file.name);if(e!=='json'&&!MIME[e])fail('故事包只支持 JSON、图片和音频：'+file.name);
   return true;
  }});}catch(error){if(error.message&&/[\u3400-\u9fff]/.test(error.message))throw error;fail('无法解压故事包，请选择完整、未加密的 ZIP 文件');}
  const names=Object.keys(all);const manifests=names.filter(name=>name==='story.json'||name.endsWith('/story.json'));
  if(manifests.length!==1)fail('故事包需要且只能包含一个 story.json');
  const manifestName=manifests[0],prefix=manifestName.slice(0,-'story.json'.length);const files=Object.create(null);let actual=0;
  for(const [name,data] of Object.entries(all)){
   actual+=data.byteLength;if(actual>LIMITS.total||data.byteLength>LIMITS.file)fail('故事包解压大小超出限制');
   if(prefix&&!name.startsWith(prefix))fail('所有故事资源必须与 story.json 位于同一目录');
   const relative=name.slice(prefix.length);if(relative==='story.json')continue;
   if(!MIME[ext(relative)])fail('不支持的故事资源：'+relative);checkMedia(relative,data);files[relative]=data;
  }
  const json=all[manifestName];if(json.length>LIMITS.json)fail('story.json 不能超过 2 MiB');let manifest;
  try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(json));}catch{fail('story.json 不是有效的 UTF-8 JSON');}
  return {manifest:validate(manifest,files),files,totalBytes:actual};
 }
 root.StoryCodec={LIMITS,MIME,validate,decode,path,checkMedia,collectAssetPaths};
})(globalThis);

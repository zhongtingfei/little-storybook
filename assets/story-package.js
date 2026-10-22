(function(root){
 'use strict';
 const scriptURL=document.currentScript.src;
 const urls=new Set();
 let dbPromise;
 function database(){
  if(!root.indexedDB)return Promise.reject(new Error('当前浏览器无法保存故事本，请使用本机 HTTP 预览后重试'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open('little-stories-content',1);request.onupgradeneeded=()=>request.result.createObjectStore('books');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('本机故事存储不可用，请检查浏览器的站点存储设置'));request.onblocked=()=>reject(new Error('故事存储正在被其他页面占用，请关闭旧页面后重试'));});
  return dbPromise;
 }
 async function read(){const db=await database();return new Promise((resolve,reject)=>{const request=db.transaction('books','readonly').objectStore('books').get('current');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(new Error('无法读取本机故事本，请重新导入'));});}
 async function save(value){const db=await database();return new Promise((resolve,reject)=>{const transaction=db.transaction('books','readwrite');transaction.objectStore('books').put(value,'current');transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('故事本保存失败，原故事仍然保留。请检查本机空间后重试'));transaction.onabort=()=>reject(new Error('故事本未保存，原故事仍然保留'));});}
 function materialize(record){
  const assets=Object.create(null);const ownUrls=[];
  for(const [name,bytes] of Object.entries(record.files)){const mime=StoryCodec.MIME[name.split('.').pop().toLowerCase()];const url=URL.createObjectURL(new Blob([bytes],{type:mime}));assets[name]=url;urls.add(url);ownUrls.push(url);}
  return {manifest:record.manifest,source:record.source||'imported',totalBytes:record.totalBytes||0,assets,url:path=>path?assets[path]:null,release(){for(const url of ownUrls){URL.revokeObjectURL(url);urls.delete(url);}}};
 }
 async function checkImages(book){
  const paths=StoryCodec.collectAssetPaths(book.manifest,'image');
  for(const name of paths)await new Promise((resolve,reject)=>{const img=new Image();const timeout=setTimeout(()=>reject(new Error('图片加载超时：'+name)),5000);img.onload=()=>{clearTimeout(timeout);if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>32000000)reject(new Error('图片尺寸过大或无效：'+name));else resolve();};img.onerror=()=>{clearTimeout(timeout);reject(new Error('无法读取图片：'+name));};img.src=book.url(name);});
 }
 function decode(buffer){
  // Direct-file browsers may refuse a Worker. The same bounded validator remains available locally.
  return new Promise((resolve,reject)=>{let worker;try{worker=new Worker(new URL('story-package-worker.js',scriptURL));}catch{try{resolve(StoryCodec.decode(new Uint8Array(buffer)));}catch(error){reject(error);}return;}
   let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;worker.terminate();reject(new Error('故事包检查超时，请减小资源大小后重试'));}},30000);
   worker.onmessage=event=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();event.data.ok?resolve(event.data):reject(new Error(event.data.error));};
   worker.onerror=()=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();try{resolve(StoryCodec.decode(new Uint8Array(buffer)));}catch(error){reject(error);}};
   worker.postMessage(buffer);
  });
 }
 async function importFile(file){
  if(!file||!file.name.toLowerCase().endsWith('.zip'))throw new Error('请选择 ZIP 格式的故事本');
  if(file.size>StoryCodec.LIMITS.zip)throw new Error('故事包不能超过 64 MiB');
  const record=await decode(await file.arrayBuffer());record.source='imported';
  const book=materialize(record);
  try{await checkImages(book);await save(record);return book;}catch(error){book.release();throw error;}
 }
 async function demo(){
  if(location.protocol==='file:')return null;
  const response=await fetch(new URL('../storybooks/demo/story.json',scriptURL));if(!response.ok)throw new Error('示例故事加载失败，可导入本机故事包');
  const raw=await response.json();const names=StoryCodec.collectAssetPaths(raw);
  const files=Object.create(null);let totalBytes=0;
  await Promise.all([...names].map(async name=>{StoryCodec.path(name);const result=await fetch(new URL('../storybooks/demo/'+name,scriptURL));if(!result.ok)throw new Error('示例资源缺失：'+name);files[name]=new Uint8Array(await result.arrayBuffer());StoryCodec.checkMedia(name,files[name]);totalBytes+=files[name].byteLength;}));
  return materialize({manifest:StoryCodec.validate(raw,files),files,totalBytes,source:'demo'});
 }
 async function current(){const record=await read();if(record){record.manifest=StoryCodec.validate(record.manifest,record.files);return materialize(record);}return demo();}
 root.StoryPackages={current,importFile,demo,materialize};
 root.addEventListener('pagehide',()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();});
})(globalThis);

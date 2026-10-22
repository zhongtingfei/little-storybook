window.BookUI=(function(){
 'use strict';
 const $$=selector=>[...document.querySelectorAll(selector)];
 function image(url,className=''){const el=document.createElement('img');el.src=url;el.alt='';el.className=className;el.draggable=false;return el;}
 function paint(book){
  const m=book.manifest;
  $$('[data-book-field]').forEach(el=>{el.textContent=m[el.dataset.bookField]||'';});
  $$('[data-book-ending]').forEach(el=>{el.textContent=m.ending[el.dataset.bookEnding]||'';});
  $$('[data-book-pages]').forEach(el=>el.textContent=m.pages.length);
  $$('[data-book-source]').forEach(el=>el.textContent=book.source==='demo'?'示例故事本':'本机已导入');
  $$('[data-book-background]').forEach(el=>el.style.backgroundImage=`url("${book.url(m.cover.background)}")`);
  $$('[data-book-cover-layers]').forEach(el=>{el.replaceChildren();for(const layer of m.cover.layers){const img=image(book.url(layer.image));img.style.cssText=`left:${layer.x}%;top:${layer.y}%;width:${layer.width}%;aspect-ratio:${layer.aspectRatio};`;el.appendChild(img);}});
  $$('[data-book-image="ending"]').forEach(el=>{el.replaceChildren();if(m.ending.image)el.appendChild(image(book.url(m.ending.image)));});
  $$('[data-book-read]').forEach(el=>{el.removeAttribute('aria-disabled');el.classList.remove('is-disabled');});
  const ready=document.querySelector('#book-ready');if(ready)ready.hidden=false;
  const status=document.querySelector('#import-status');if(status&&!status.classList.contains('is-error'))status.textContent=new URLSearchParams(location.search).has('imported')?'故事本已导入并保存在本机，可以开始共读。':'支持导入 ZIP 故事包；内容只保存在这台设备。';
  document.title=(location.pathname.endsWith('read.html')?'正在共读 · ':location.pathname.endsWith('parents.html')?'家长指南 · ':'')+m.title+' · 小小故事';
 }
 function initImport(){
  const input=document.querySelector('#book-file');if(!input)return;
  const status=document.querySelector('#import-status'),zone=document.querySelector('#import-zone');let busy=false;
  const say=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);status.setAttribute('role',error?'alert':'status');};
  const setBusy=value=>{busy=value;zone.setAttribute('aria-busy',String(value));$$('[data-import-book],#load-demo').forEach(el=>el.disabled=value);};
  async function importBook(file){
   if(busy||!file)return;setBusy(true);say('正在检查故事配置、图片和音频，请稍等……');
   try{const book=await StoryPackages.importFile(file);say('导入完成，正在打开「'+book.manifest.title+'」……');book.release();location.href='index.html?imported=1';}
   catch(error){say(error.message+'。当前故事不会被替换。',true);setBusy(false);}
   finally{input.value='';}
  }
  $$('[data-import-book]').forEach(button=>button.addEventListener('click',()=>{if(!busy)input.click();}));
  input.addEventListener('change',()=>importBook(input.files[0]));
  zone.addEventListener('dragover',event=>{event.preventDefault();if(!busy)zone.classList.add('dragging');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('dragging');if(!busy){if(event.dataTransfer.files.length!==1){say('每次请选择一个 ZIP 故事本。',true);return;}importBook(event.dataTransfer.files[0]);}});
  document.querySelector('#load-demo').addEventListener('click',async()=>{
   if(busy)return;setBusy(true);say('正在打开示例故事包……');
   try{const result=await fetch('storybooks/samples/moon-star.zip');if(!result.ok)throw new Error('无法加载示例，请下载示例 ZIP 后手动导入');const file=new File([await result.arrayBuffer()],'moon-star.zip',{type:'application/zip'});setBusy(false);await importBook(file);}
   catch(error){say(error.message,true);setBusy(false);}
  });
 }
 function empty(error){
  const status=document.querySelector('#import-status');if(status){status.textContent=error||'还没有故事本，导入一个 ZIP 包即可开始。';status.classList.toggle('is-error',Boolean(error));$$('[data-book-read]').forEach(el=>{el.setAttribute('aria-disabled','true');el.classList.add('is-disabled');el.addEventListener('click',event=>event.preventDefault());});return;}
  const main=document.querySelector('main');if(!main)return;main.replaceChildren();main.className='book-required';const title=document.createElement('h1');title.className='serif';title.textContent='先导入一本故事';const copy=document.createElement('p');copy.textContent=error||'播放器已经准备好，选择故事本后就能开始共读。';const link=document.createElement('a');link.className='btn btn-primary';link.href='index.html';link.textContent='去导入故事本';main.append(title,copy,link);
 }
 return {paint,initImport,empty,image};
})();

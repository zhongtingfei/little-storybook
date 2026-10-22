importScripts('vendor/fflate-0.8.3.js','story-codec.js');
self.onmessage=function(event){
 try{const result=StoryCodec.decode(new Uint8Array(event.data));self.postMessage({ok:true,...result},[...new Set(Object.values(result.files).map(file=>file.buffer))]);}
 catch(error){self.postMessage({ok:false,error:error.message||'故事包检查失败'});}
};

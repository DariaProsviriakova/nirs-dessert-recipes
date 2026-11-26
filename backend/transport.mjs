import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { readFileSync } from 'node:fs';

// Extra trust applies only to this LLM client's requests. OS/browser trust is unchanged.
export function llmTransport(caFile) {
  if (!caFile) return fetch;
  const ca=[...rootCertificates,readFileSync(caFile,'utf8')];
  return (url,options={})=>new Promise((resolve,reject)=>{
    const target=new URL(url);
    if (target.protocol!=='https:') { reject(new Error('LLM requires HTTPS')); return; }
    const request=https.request(target,{method:options.method || 'GET',headers:options.headers,ca,signal:options.signal},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{
        size+=chunk.length;
        if (size>1024*1024) { request.destroy(new Error('LLM response too large')); return; }
        chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>{
        const bytes=Buffer.concat(chunks);
        resolve({ok:response.statusCode>=200 && response.statusCode<300,status:response.statusCode,
          json:async()=>JSON.parse(bytes.toString('utf8'))});
      });
    });
    request.on('error',reject);
    request.end(options.body);
  });
}

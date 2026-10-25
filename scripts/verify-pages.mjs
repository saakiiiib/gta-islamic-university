import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const base=new URL(process.argv[2]??'https://saakiiiib.github.io/gta-islamic-university/');
const revision=process.argv[3]??'verification';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile('docs/visual/manifest.json','utf8'));
const html=await readFile('docs/index.html','utf8');
const linked=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(p=>!p.startsWith('#')&&!/^https?:/.test(p));
const paths=[...new Set(['index.html','data/map.osm','data/NOTICE.txt','favicon.svg','audio/reactions.json','audio/README.txt',
  ...['near_01','near_02','hit_01','hit_02'].map(n=>`audio/npc/${n}.mp3`),
  'visual/manifest.json',...manifest.files.map(f=>`visual/${f.path}`),...linked.map(p=>p.replace(/^\.\//,''))])];
const results=[];
let next=0;
await Promise.all(Array.from({length:4},async()=>{
  while(next<paths.length){
    const path=paths[next++],url=new URL(path,base);url.searchParams.set('release',revision);
    try{
      const expected=await readFile(resolve('docs',path));
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      const body=Buffer.from(await response.arrayBuffer());
      const exactMatch=sha(body)===sha(expected);
      // Git normalises CRLF in documentation/JSON. Keep map, programs, images,
      // model buffers and audio strictly byte-for-byte; report document-only
      // newline normalisation explicitly instead of hiding an actual mismatch.
      const documentNewlines=/\.(txt|json)$/.test(path) && body.toString('utf8').replace(/\r\n/g,'\n')===expected.toString('utf8').replace(/\r\n/g,'\n');
      results.push({path,status:response.status,bytes:body.length,sha256:sha(body),exactMatch,
        normalization:!exactMatch&&documentNewlines?'CRLF-to-LF documents only':null,matches:response.ok&&(exactMatch||documentNewlines)});
    }catch(error){results.push({path,error:error.message,matches:false});}
  }
}));
results.sort((a,b)=>a.path.localeCompare(b.path));
const report={checkedAt:new Date().toISOString(),url:base.href,revision,files:results.length,passed:results.every(r=>r.matches),results};
await mkdir('validation/phase3',{recursive:true});await writeFile('validation/phase3/hosted-assets.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,files:report.files,failures:results.filter(r=>!r.matches)},null,2));
if(!report.passed)process.exitCode=1;

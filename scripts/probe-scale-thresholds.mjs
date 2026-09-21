import { readFile } from "node:fs/promises";
const services=JSON.parse(await readFile("public/services.json","utf8")).services.slice(10,16);
const CENTER={lon:32.8542,lat:39.9208};
const SCALES=[250000,300000,350000,400000,450000,500000,600000];
const TIMEOUT=16000;
function rootAndLayer(url){const m=url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);return{root:m?.[1]??url,layer:m?.[2]??"0"};}
function withQuery(url,params){const u=new URL(url);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));return u.toString();}
function bboxForScale(scale){
  const widthM=scale*(256/96)*0.0254;
  const lonMeters=111320*Math.cos(CENTER.lat*Math.PI/180);
  const halfLon=widthM/(2*lonMeters);
  const halfLat=widthM/(2*110574);
  return [CENTER.lon-halfLon,CENTER.lat-halfLat,CENTER.lon+halfLon,CENTER.lat+halfLat].map(v=>v.toFixed(6)).join(",");
}
async function probe(task){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT);const started=performance.now();
 try{
  const response=await fetch(task.url,{signal:controller.signal,headers:{accept:"application/json,*/*","user-agent":"altyapi-scale-threshold-verifier/1.0"}});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{}
  return {...task,ok:Boolean(response.ok&&!data?.error&&typeof data?.href==="string"),http:response.status,ms:Math.round(performance.now()-started),error:data?.error?.message??null};
 }catch(error){return{...task,ok:false,http:0,ms:Math.round(performance.now()-started),error:error?.cause?.code??error?.name??"network"}}
 finally{clearTimeout(timer);}
}
const tasks=[];
for(let i=0;i<services.length;i++){
 const s=services[i], {root,layer}=rootAndLayer(s.tokenUrl);
 for(const scale of SCALES){
  tasks.push({index:i+11,name:s.cografiVeriKatmanAdi,scale,url:withQuery(root+"/export",{bbox:bboxForScale(scale),bboxSR:4326,imageSR:3857,size:"256,256",format:"png32",transparent:"true",layers:`show:${layer}`,f:"json"})});
 }
}
const results=new Array(tasks.length);let cursor=0;
async function worker(){while(cursor<tasks.length){const n=cursor++;results[n]=await probe(tasks[n]);}}
await Promise.all(Array.from({length:6},()=>worker()));
for(const row of results) console.log(`[${row.index}] ${row.name} scale=1:${row.scale} ${row.ok?"PASS":"FAIL"} ms=${row.ms} HTTP=${row.http} error=${row.error??"none"}`);
const summary={};
for(const scale of SCALES){const rows=results.filter(r=>r.scale===scale);summary[scale]={pass:rows.filter(r=>r.ok).length,total:rows.length,maxMs:Math.max(...rows.map(r=>r.ms)),avgMs:Math.round(rows.reduce((s,r)=>s+r.ms,0)/rows.length)};}
console.log("SUMMARY "+JSON.stringify(summary));

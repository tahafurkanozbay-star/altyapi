import { readFile } from "node:fs/promises";
const services=JSON.parse(await readFile("public/services.json","utf8")).services.slice(10,16);
const WINDOWS=[
  ["province","30.80,38.68,33.90,40.82"],
  ["metro","32.10,39.35,33.60,40.35"],
  ["city","32.55,39.65,33.20,40.15"],
  ["close","32.75,39.82,33.00,40.04"]
];
const TIMEOUT=15000;

function rootAndLayer(url){
  const m=url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  return {root:m?.[1]??url,layer:m?.[2]??"0"};
}
function withQuery(url,params){const u=new URL(url);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));return u.toString();}
async function fetchTimed(url,accept){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT);const started=performance.now();
  try{
    const response=await fetch(url,{signal:controller.signal,redirect:"follow",headers:{accept,"user-agent":"altyapi-render-window-verifier/1.0"}});
    const body=await response.arrayBuffer();
    return {ok:response.ok,status:response.status,ms:Math.round(performance.now()-started),bytes:body.byteLength,type:response.headers.get("content-type")??"",text:new TextDecoder().decode(body)};
  }catch(error){return{ok:false,status:0,ms:Math.round(performance.now()-started),bytes:0,type:"",text:"",error:error?.cause?.code??error?.name??"network"}}
  finally{clearTimeout(timer);}
}

const tasks=[];
for(let i=0;i<services.length;i++){
  const s=services[i];const {root,layer}=rootAndLayer(s.tokenUrl);
  for(const [label,bbox] of WINDOWS){
    tasks.push({index:i,service:s,root,layer,label,bbox});
  }
}
const results=new Array(tasks.length);
let cursor=0;
async function worker(){
  while(cursor<tasks.length){
    const taskIndex=cursor++;
    const {index,service:s,root,layer,label,bbox}=tasks[taskIndex];
    const exportUrl=withQuery(root+"/export",{bbox,bboxSR:4326,imageSR:3857,size:"256,256",format:"png32",transparent:"true",layers:`show:${layer}`,f:"json"});
    const meta=await fetchTimed(exportUrl,"application/json,*/*");
    let data;try{data=JSON.parse(meta.text)}catch{}
    if(!meta.ok||data?.error||typeof data?.href!=="string"){
      results[taskIndex]={index:index+11,name:s.cografiVeriKatmanAdi,label,ok:false,metaMs:meta.ms,imageMs:null,bytes:0,http:meta.status,error:data?.error?.message??meta.error??"no-image-href"};
      continue;
    }
    const image=await fetchTimed(data.href,"image/png,image/*,*/*");
    results[taskIndex]={index:index+11,name:s.cografiVeriKatmanAdi,label,ok:Boolean(image.ok&&/^image\\//i.test(image.type)&&image.bytes>100),metaMs:meta.ms,imageMs:image.ms,bytes:image.bytes,http:image.status,error:image.ok?null:(image.error??"image-fail")};
  }
}
await Promise.all(Array.from({length:6},()=>worker()));
for(const row of results){
  console.log(`[${row.index}] ${row.name} ${row.label.padEnd(8)} ${row.ok?"PASS":"FAIL"} metaMs=${row.metaMs} imageMs=${row.imageMs??"-"} bytes=${row.bytes} HTTP=${row.http} error=${row.error??"none"}`);
}
const summary={};
for(const row of results){
  const key=String(row.index);
  summary[key]??={name:row.name,passes:[]};
  if(row.ok) summary[key].passes.push(row.label);
}
console.log("SUMMARY "+JSON.stringify(summary));

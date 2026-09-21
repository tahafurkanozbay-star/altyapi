import { readFile } from "node:fs/promises";
const services=JSON.parse(await readFile("public/services.json","utf8")).services.slice(10,16);
const WINDOWS=[
  ["province","30.80,38.68,33.90,40.82"],
  ["metro","32.10,39.35,33.60,40.35"],
  ["city","32.55,39.65,33.20,40.15"],
  ["close","32.75,39.82,33.00,40.04"]
];
const TIMEOUT=35000;

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

for(let i=0;i<services.length;i++){
  const s=services[i];const {root,layer}=rootAndLayer(s.tokenUrl);
  console.log(`SERVICE [${i+11}] ${s.cografiVeriKatmanAdi}`);
  for(const [label,bbox] of WINDOWS){
    const exportUrl=withQuery(root+"/export",{bbox,bboxSR:4326,imageSR:3857,size:"256,256",format:"png32",transparent:"true",layers:`show:${layer}`,f:"json"});
    const meta=await fetchTimed(exportUrl,"application/json,*/*");
    let data;try{data=JSON.parse(meta.text)}catch{}
    if(!meta.ok||data?.error||typeof data?.href!=="string"){
      console.log(`  ${label.padEnd(8)} FAIL HTTP=${meta.status} ms=${meta.ms} error=${data?.error?.message??meta.error??"no-image-href"}`);
      continue;
    }
    const image=await fetchTimed(data.href,"image/png,image/*,*/*");
    const valid=image.ok&&/^image\//i.test(image.type)&&image.bytes>100;
    console.log(`  ${label.padEnd(8)} ${valid?"PASS":"FAIL"} metaMs=${meta.ms} imageMs=${image.ms} bytes=${image.bytes} HTTP=${image.status}`);
  }
}

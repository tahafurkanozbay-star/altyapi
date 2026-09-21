import { readFile } from "node:fs/promises";
const services=JSON.parse(await readFile("public/services.json","utf8")).services;

function withQuery(url,params){const u=new URL(url);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u.toString();}

async function run(service,index){
  const q=service.tokenUrl.replace(/\/$/,"")+"/query";
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),60000);
  const started=performance.now();
  try{
    const response=await fetch(withQuery(q,{where:"1=1",returnExtentOnly:"true",outSR:4326,f:"json"}),{
      signal:controller.signal,
      headers:{accept:"application/json,*/*","user-agent":"altyapi-long-extent-verifier/1.0"}
    });
    const text=await response.text();
    let data;try{data=JSON.parse(text)}catch{}
    const e=data?.extent;
    const extent=e&&[e.xmin,e.ymin,e.xmax,e.ymax].every(Number.isFinite)?{
      xmin:+e.xmin.toFixed(6),ymin:+e.ymin.toFixed(6),xmax:+e.xmax.toFixed(6),ymax:+e.ymax.toFixed(6),
      wkid:e.spatialReference?.latestWkid??e.spatialReference?.wkid??null
    }:null;
    console.log(`[${index+1}] ${response.ok&&extent?"OK":"FAIL"} ${service.cografiVeriKatmanAdi} HTTP=${response.status} ms=${Math.round(performance.now()-started)} extent=${extent?JSON.stringify(extent):"none"} error=${data?.error?.message??"none"}`);
  }catch(error){
    console.log(`[${index+1}] FAIL ${service.cografiVeriKatmanAdi} ms=${Math.round(performance.now()-started)} error=${error?.cause?.code??error?.name??"network"}`);
  }finally{clearTimeout(timer);}
}
await run(services[14],14);
await run(services[15],15);

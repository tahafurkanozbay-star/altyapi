import { readFile, writeFile } from "node:fs/promises";

const services = JSON.parse(await readFile("public/services.json","utf8")).services;
const TIMEOUT = 15000;

function withQuery(url, params) {
  const target = new URL(url);
  for (const [k,v] of Object.entries(params)) target.searchParams.set(k,String(v));
  return target.toString();
}

async function request(url, accept="application/json,*/*") {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), TIMEOUT);
  const started=performance.now();
  try {
    const response=await fetch(url,{signal:controller.signal,redirect:"follow",headers:{accept,"user-agent":"altyapi-data-extent-verifier/1.0"}});
    const text=await response.text();
    return {ok:response.ok,status:response.status,text,ms:Math.round(performance.now()-started)};
  } catch(error) {
    return {ok:false,status:0,text:"",ms:Math.round(performance.now()-started),error:error?.cause?.code??error?.name??"network-error"};
  } finally { clearTimeout(timer); }
}

function safeExtent(value) {
  const e=value?.extent ?? value;
  if(!e||![e.xmin,e.ymin,e.xmax,e.ymax].every(Number.isFinite)) return null;
  return {xmin:+e.xmin.toFixed(6),ymin:+e.ymin.toFixed(6),xmax:+e.xmax.toFixed(6),ymax:+e.ymax.toFixed(6),wkid:e.spatialReference?.latestWkid??e.spatialReference?.wkid??null};
}

async function json(url) {
  const res=await request(url);
  if(!res.ok) return {...res,data:null};
  try {
    const data=JSON.parse(res.text);
    return {...res,data};
  } catch { return {...res,ok:false,data:null,error:"invalid-json"}; }
}

function queryUrl(service) {
  if(service.servisTuruAdi==="MapServer" && /\/MapServer\/\d+\/?$/i.test(service.tokenUrl)) return service.tokenUrl.replace(/\/$/,"")+"/query";
  if(service.servisTuruAdi==="FeatureServer" && /\/FeatureServer\/\d+\/?$/i.test(service.tokenUrl)) return service.tokenUrl.replace(/\/$/,"")+"/query";
  return null;
}

const results=[];
for(let i=0;i<services.length;i++){
  const s=services[i];
  const q=queryUrl(s);
  if(!q) continue;

  const [extentRes,countRes]=await Promise.all([
    json(withQuery(q,{where:"1=1",returnExtentOnly:"true",outSR:4326,f:"json"})),
    json(withQuery(q,{where:"1=1",returnCountOnly:"true",f:"json"}))
  ]);

  const extent=extentRes.data?.error ? null : safeExtent(extentRes.data);
  const count=Number.isFinite(countRes.data?.count) ? countRes.data.count : null;
  const row={
    index:i,
    name:s.cografiVeriKatmanAdi,
    kind:s.servisTuruAdi,
    ok:Boolean(extent && count !== null),
    extent,
    count,
    extentHttp:extentRes.status,
    countHttp:countRes.status,
    ms:Math.max(extentRes.ms,countRes.ms)
  };
  results.push(row);
  console.log(`[${String(i+1).padStart(2,"0")}] ${row.ok?"OK":"FAIL"} ${row.kind} ${row.name} count=${row.count??"n/a"} extent=${row.extent?JSON.stringify(row.extent):"none"}`);
}

await writeFile("data-extent-report.json",JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+"\n");
console.log("SUMMARY "+JSON.stringify({tested:results.length,ok:results.filter(r=>r.ok).length,fail:results.filter(r=>!r.ok).length}));

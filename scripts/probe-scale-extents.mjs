import { readFile, writeFile } from "node:fs/promises";

const services = JSON.parse(await readFile("public/services.json","utf8")).services;
const TIMEOUT = 15000;

function withQuery(url, params) {
  const target = new URL(url);
  for (const [k,v] of Object.entries(params)) target.searchParams.set(k,String(v));
  return target.toString();
}

async function getText(url, accept="*/*") {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), TIMEOUT);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {accept, "user-agent":"altyapi-scale-extent-verifier/1.0"}
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      ms: Math.round(performance.now()-started)
    };
  } catch (error) {
    return {
      ok:false,
      status:0,
      text:"",
      ms:Math.round(performance.now()-started),
      error:error?.cause?.code ?? error?.name ?? "network-error"
    };
  } finally {
    clearTimeout(timer);
  }
}

function arcgisExtent(meta) {
  const e = meta?.extent ?? meta?.fullExtent ?? meta?.initialExtent;
  if (!e || !Number.isFinite(e.xmin) || !Number.isFinite(e.ymin) || !Number.isFinite(e.xmax) || !Number.isFinite(e.ymax)) return null;
  return {
    xmin:+e.xmin.toFixed(3), ymin:+e.ymin.toFixed(3), xmax:+e.xmax.toFixed(3), ymax:+e.ymax.toFixed(3),
    wkid:e.spatialReference?.latestWkid ?? e.spatialReference?.wkid ?? null
  };
}

function cleanScale(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

async function probeArcgis(service) {
  let metaUrl = withQuery(service.tokenUrl,{f:"json"});
  if (service.servisTuruAdi === "SceneServer" && !/\/layers\/\d+\/?$/i.test(service.tokenUrl)) {
    metaUrl = withQuery(service.tokenUrl.replace(/\/$/,"")+"/layers/0",{f:"json"});
  }
  const res = await getText(metaUrl,"application/json,*/*");
  if (!res.ok) return {ok:false,http:res.status,ms:res.ms,error:res.error ?? `HTTP ${res.status}`};
  let meta;
  try { meta=JSON.parse(res.text); } catch { return {ok:false,http:res.status,ms:res.ms,error:"invalid-json"}; }
  if (meta?.error) return {ok:false,http:res.status,ms:res.ms,error:"arcgis-error"};
  const root = {
    ok:true,
    http:res.status,
    ms:res.ms,
    minScale:cleanScale(meta.minScale),
    maxScale:cleanScale(meta.maxScale),
    extent:arcgisExtent(meta),
    childScaleRanges:[]
  };

  if (service.servisTuruAdi === "MapServer" && /\/MapServer\/?$/i.test(service.tokenUrl) && Array.isArray(meta.layers)) {
    const children=[];
    for (const layerInfo of meta.layers.slice(0,30)) {
      if (!Number.isInteger(layerInfo.id)) continue;
      const childRes=await getText(withQuery(service.tokenUrl.replace(/\/$/,"")+`/${layerInfo.id}`,{f:"json"}),"application/json,*/*");
      if (!childRes.ok) continue;
      let child; try { child=JSON.parse(childRes.text); } catch { continue; }
      if (child?.error) continue;
      children.push({
        id:layerInfo.id,
        name:String(layerInfo.name ?? `Layer ${layerInfo.id}`).slice(0,80),
        minScale:cleanScale(child.minScale),
        maxScale:cleanScale(child.maxScale),
        extent:arcgisExtent(child)
      });
    }
    root.childScaleRanges=children;
  }
  return root;
}

function parseWmsCapabilities(xml) {
  const mins=[...xml.matchAll(/<MinScaleDenominator>([\d.]+)<\/MinScaleDenominator>/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  const maxs=[...xml.matchAll(/<MaxScaleDenominator>([\d.]+)<\/MaxScaleDenominator>/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  const geo=xml.match(/<EX_GeographicBoundingBox>[\s\S]*?<westBoundLongitude>([-\d.]+)<\/westBoundLongitude>[\s\S]*?<eastBoundLongitude>([-\d.]+)<\/eastBoundLongitude>[\s\S]*?<southBoundLatitude>([-\d.]+)<\/southBoundLatitude>[\s\S]*?<northBoundLatitude>([-\d.]+)<\/northBoundLatitude>/i);
  return {
    minScale:mins.length ? Math.round(Math.max(...mins)) : 0,
    maxScale:maxs.length ? Math.round(Math.min(...maxs)) : 0,
    extent:geo ? {xmin:Number(geo[1]),ymin:Number(geo[3]),xmax:Number(geo[2]),ymax:Number(geo[4]),wkid:4326}:null
  };
}

async function probeOgc(service) {
  const res=await getText(withQuery(service.tokenUrl,{SERVICE:service.servisTuruAdi,REQUEST:"GetCapabilities",VERSION:service.servisTuruAdi==="WMS"?"1.3.0":"2.0.0"}),"application/xml,text/xml,*/*");
  if(!res.ok) return {ok:false,http:res.status,ms:res.ms,error:res.error ?? `HTTP ${res.status}`};
  if(/ExceptionReport|ServiceException|ExceptionText/i.test(res.text)) return {ok:false,http:res.status,ms:res.ms,error:"service-exception"};
  if(service.servisTuruAdi==="WMS") return {ok:true,http:res.status,ms:res.ms,...parseWmsCapabilities(res.text),childScaleRanges:[]};
  const bbox=res.text.match(/<ows:WGS84BoundingBox[^>]*>[\s\S]*?<ows:LowerCorner>([-\d.]+)\s+([-\d.]+)<\/ows:LowerCorner>[\s\S]*?<ows:UpperCorner>([-\d.]+)\s+([-\d.]+)<\/ows:UpperCorner>/i);
  return {ok:true,http:res.status,ms:res.ms,minScale:0,maxScale:0,extent:bbox?{xmin:Number(bbox[1]),ymin:Number(bbox[2]),xmax:Number(bbox[3]),ymax:Number(bbox[4]),wkid:4326}:null,childScaleRanges:[]};
}

const results=[];
for(let i=0;i<services.length;i++){
  const s=services[i];
  const probe=["MapServer","FeatureServer","SceneServer"].includes(s.servisTuruAdi) ? await probeArcgis(s) : await probeOgc(s);
  const scaleLimited=probe.ok && (
    (probe.minScale ?? 0) > 0 ||
    (probe.maxScale ?? 0) > 0 ||
    (probe.childScaleRanges ?? []).some(x=>(x.minScale ?? 0)>0 || (x.maxScale ?? 0)>0)
  );
  const row={index:i,name:s.cografiVeriKatmanAdi,kind:s.servisTuruAdi,scaleLimited,...probe};
  results.push(row);
  const childLimited=(row.childScaleRanges ?? []).filter(x=>x.minScale>0||x.maxScale>0);
  console.log(`[${String(i+1).padStart(2,"0")}/${services.length}] ${row.ok?"OK":"FAIL"} ${scaleLimited?"SCALE-LIMITED":"NO-SCALE-LIMIT"} ${row.kind} ${row.name} min=1:${row.minScale||0} max=1:${row.maxScale||0} childLimited=${childLimited.length} extent=${row.extent?JSON.stringify(row.extent):"none"}`);
  for(const child of childLimited.slice(0,12)) {
    console.log(`  child#${child.id} ${child.name} min=1:${child.minScale||0} max=1:${child.maxScale||0}`);
  }
}
const report={checkedAt:new Date().toISOString(),total:results.length,scaleLimited:results.filter(r=>r.scaleLimited).length,results};
await writeFile("scale-extent-report.json",JSON.stringify(report,null,2)+"\n");
console.log("SUMMARY "+JSON.stringify({total:report.total,scaleLimited:report.scaleLimited,ok:results.filter(r=>r.ok).length,fail:results.filter(r=>!r.ok).length}));

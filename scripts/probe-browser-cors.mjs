import { readFile } from "node:fs/promises";
const services = JSON.parse(await readFile("public/services.json","utf8")).services;
const ORIGIN = "https://tahafurkanozbay-star.github.io";
const targets = [services[16], services[17], services[18], services[19]];

function addQuery(url, params) {
  const target = new URL(url);
  for (const [k,v] of Object.entries(params)) target.searchParams.set(k,String(v));
  return target.toString();
}

async function check(service) {
  let url = addQuery(service.tokenUrl,{f:"json"});
  if (service.servisTuruAdi === "FeatureServer") {
    url = addQuery(service.tokenUrl.replace(/\/$/,"")+"/query",{where:"1=1",returnCountOnly:"true",f:"json"});
  }
  if (service.servisTuruAdi === "SceneServer") {
    url = addQuery(service.tokenUrl.replace(/\/$/,"")+"/layers/0",{f:"json"});
  }
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{Origin:ORIGIN,Accept:"application/json,*/*","User-Agent":"altyapi-browser-cors-verifier/1.0"}});
    const text = await response.text();
    let data; try { data=JSON.parse(text); } catch {}
    const acao=response.headers.get("access-control-allow-origin");
    const valid=response.ok && data && !data.error;
    const browserAllowed = acao === "*" || acao === ORIGIN;
    console.log(`${valid ? "DATA-PASS":"DATA-FAIL"} ${browserAllowed ? "CORS-PASS":"CORS-FAIL"} ${service.servisTuruAdi} ${service.cografiVeriKatmanAdi} HTTP=${response.status} ACAO=${acao ?? "none"}`);
  } catch (error) {
    console.log(`NETWORK-FAIL ${service.servisTuruAdi} ${service.cografiVeriKatmanAdi} ${error?.cause?.code ?? error?.message ?? "error"}`);
  } finally { clearTimeout(timer); }
}

for (const service of targets) await check(service);

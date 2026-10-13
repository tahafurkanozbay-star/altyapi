import type { Page } from "@playwright/test";
import { runtimeFixture } from "./runtimeFixture";
import type { AttributeQueryOptions } from "../src/types";

// Controlled transport delays and failures exercise real App/DataWorkbench ownership.
export const queryFixture = runtimeFixture.replace("export class ArcGISRuntime", "class BaseRuntime") + `
window.attributeRequests = [];
export class ArcGISRuntime extends BaseRuntime {
  async queryAttributes(service, options, signal) {
    if (!signal) throw new Error('Missing cancellation signal');
    signal.throwIfAborted();
    const mode = window.attributeMode || 'success'; window.attributeMode = 'success';
    const request = { serviceId: service.id, options, aborted: false, finished: false };
    window.attributeRequests.push(request);
    signal.addEventListener('abort', () => { request.aborted = true; }, {once:true});
    try {
      if (mode === 'hold') await new Promise((resolve,reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled','AbortError')), {once:true}));
      if (mode === 'late') await new Promise(resolve => setTimeout(resolve, 1200));
      if (mode === 'fail') throw new Error('Deneme sorgusu reddedildi.');
      const base = await super.queryAttributes(service, options);
      const total = 205;
      const rows = Array.from({length:Math.min(options.limit, Math.max(0,total-options.offset))}, (_,i) => ({id:options.offset+i+1,ilce:'Çankaya',mahalle:'Mahalle '+(options.offset+i+1),adres:'Ankara',aciklama:'Kayıt',durum:'Açık'}));
      return {...base, rows, total, offset:options.offset, limit:options.limit, hasPrevious:options.offset>0, hasNext:options.offset+rows.length<total, truncated:total>rows.length};
    } finally { request.finished = true; }
  }
}
`;
type QueryWindow = Window & { attributeMode: string; attributeRequests: Array<{ serviceId: string; options: AttributeQueryOptions; aborted: boolean; finished: boolean }> };
export const mode = (page: Page, value: string) => page.evaluate(value => { (window as unknown as QueryWindow).attributeMode = value; }, value);
export const requests = (page: Page) => page.evaluate(() => (window as unknown as QueryWindow).attributeRequests);

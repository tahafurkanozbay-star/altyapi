// A deterministic transport boundary for UI tests; live providers are probed
// independently. No production flag, fixture or fake data ships in the app.
export const runtimeFixture = `
export class ArcGISRuntime {
  async initialize(container, camera, basemap, callbacks) {
    this.camera = camera;
    this.desired = new Map();
    this.callbacks = callbacks;
    container.style.background = '#d9e6ef';
    const scene = document.createElement('arcgis-scene');
    scene.id = 'altyapi-main-scene';
    scene.style.cssText = 'display:block;width:100%;height:100%';
    container.append(scene);
    container.addEventListener('click', () => callbacks.onIdentify({
      title: 'Ankara altyapı inceleme noktası', subtitle: 'Çankaya',
      attributes: [{ key: 'Mahalle', value: 'Kavaklıdere' }, { key: 'Açıklama', value: 'Uzun öznitelik değerleri panel sınırlarında okunabilir biçimde satırlara ayrılır.' }]
    }));
    callbacks.onTelemetry({ latitude: 39.9208, longitude: 32.8542, scale: 12500, altitude: 5200, tilt: 58, heading: 2 });
  }
  async mountSearch(container) {
    const input = document.createElement('input');
    input.placeholder = 'Adres veya yer ara';
    input.setAttribute('aria-label', 'Adres veya yer ara');
    input.style.cssText = 'width:100%;height:44px;border:1px solid #d7e1ea;border-radius:10px;padding:12px;background:#f6f9fc';
    container.append(input);
  }
  async mountNavigation(container) {
    for (const [tag, label] of [['arcgis-home','Başlangıç görünümü'],['arcgis-compass','Yönü sıfırla'],['arcgis-locate','Konumum'],['arcgis-fullscreen','Tam ekran']]) {
      const component = document.createElement(tag);
      component.className = 'arcgis-nav-component';
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.style.cssText = 'display:block;width:100%;height:38px;border:0';
      component.append(button);
      container.append(component);
    }
    return () => container.replaceChildren();
  }
  async withLayerActivationBatch(task) { return task(); }
  async setLayerVisible(service, visible) {
    this.desired.set(service.id, visible);
    if (visible) await new Promise(resolve => setTimeout(resolve, 700));
    return { ok: true, durationMs: visible ? 700 : 0, superseded: this.desired.get(service.id) !== visible };
  }
  async reloadLayer(service) { return this.setLayerVisible(service, true); }
  setLayerOrder() {} setOpacity() {} setBasemap() {} destroy() {}
  clearIdentify() { this.callbacks.onIdentify(null); }
  async zoomToLayer() { return true; }
  getCamera() { return this.camera; }
  async goTo(camera) { this.camera = camera; }
  async goHome() {}
  async takeScreenshot() { return null; }
  async openTool(tool, container) { container.textContent = tool + ' aracı'; }
  closeTool() {}
  async queryAttributes(service, options) {
    const fields = [{name:'id',alias:'Kimlik',type:'oid'}, ...['ilce','mahalle','adres','aciklama','durum'].map(name => ({name,alias:name,type:'string'}))];
    const rows = [{id:1,ilce:'Çankaya',mahalle:'Kavaklıdere',adres:'Ankara',aciklama:'İnceleme kaydı',durum:'Açık'},{id:2,ilce:'Mamak',mahalle:'Çağlayan',adres:'Mamak',aciklama:'İkinci kayıt',durum:'Kapalı'}];
    return { serviceId:service.id,serviceName:service.displayName,fields,rows,total:rows.length,truncated:false,fetchedAt:new Date().toISOString(),offset:options.offset,limit:options.limit,hasPrevious:false,hasNext:false,objectIdField:'id',where:'1=1' };
  }
}
`;

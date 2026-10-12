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
    container.append(scene);
    callbacks.onTelemetry({ latitude: 39.9208, longitude: 32.8542, scale: 12500, altitude: 5200, tilt: 58, heading: 2 });
  }
  async mountSearch(container) {
    const input = document.createElement('input');
    input.placeholder = 'Adres veya yer ara';
    input.setAttribute('aria-label', 'Adres veya yer ara');
    input.style.cssText = 'width:100%;height:44px;border:1px solid #d7e1ea;border-radius:10px;padding:12px;background:#f6f9fc';
    container.append(input);
  }
  async mountNavigation() { return () => {}; }
  async withLayerActivationBatch(task) { return task(); }
  async setLayerVisible(service, visible) {
    this.desired.set(service.id, visible);
    if (visible) await new Promise(resolve => setTimeout(resolve, 700));
    return { ok: true, durationMs: visible ? 700 : 0, superseded: this.desired.get(service.id) !== visible };
  }
  async reloadLayer(service) { return this.setLayerVisible(service, true); }
  setLayerOrder() {} setOpacity() {} setBasemap() {} destroy() {}
  async zoomToLayer() { return true; }
  getCamera() { return this.camera; }
  async goTo(camera) { this.camera = camera; }
  async goHome() {}
  async takeScreenshot() { return null; }
  async openTool(tool, container) { container.textContent = tool + ' aracı'; }
  closeTool() {}
  async queryAttributes(service, options) { return { serviceId:service.id,serviceName:service.displayName,fields:[{name:'id',alias:'Kimlik',type:'oid'}],rows:[{id:1}],total:1,truncated:false,fetchedAt:new Date().toISOString(),offset:options.offset,limit:options.limit,hasPrevious:false,hasNext:false }; }
}
`;

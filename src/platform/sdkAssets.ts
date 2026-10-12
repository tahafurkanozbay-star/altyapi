import config from "@arcgis/core/config.js";
import { setAssetPath as setMapAssetPath } from "@arcgis/map-components";
import { setAssetPath as setCommonAssetPath } from "@arcgis/common-components";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";

// Configure before any lazy scene/tool module is imported. Resolve against the
// document so GitHub Pages subpaths and local preview use the same deployment.
const assets = new URL(`${import.meta.env.BASE_URL}sdk-assets/`, document.baseURI);
config.assetsPath = new URL("core/", assets).href;
setMapAssetPath(new URL("map/", assets).href);
setCommonAssetPath(new URL("common/", assets).href);
setCalciteAssetPath(new URL("calcite/", assets).href);

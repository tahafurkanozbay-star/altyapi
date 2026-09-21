# Component-First Scene Architecture · v13

Başkent 3B CBS v13, ArcGIS Maps SDK for JavaScript 5.1'in component-first yaklaşımına taşınmıştır.

## Neden değişti?

Önceki mimari 3B görünümü doğrudan `Map` ve `SceneView` constructor'ları ile kuruyor; ArcGIS Web Components'i bu view nesnesine `view` özelliği üzerinden bağlıyordu.

v13'te `<arcgis-scene>` harita ve SceneView yaşam döngüsünün sahibidir. Uygulama, scene bileşeninin facade API'sini ve standart DOM eventlerini kullanır. Bu sayede SDK'nın gelecekteki 6.x geçişine daha hazır, framework bağımsız ve daha az legacy coupling içeren bir mimari oluşur.

## Çalışma modeli

`ArcGISRuntime.initialize()`:

1. `@arcgis/map-components/components/arcgis-scene` modülünü lazy import eder.
2. `arcgis-scene` elementini oluşturur.
3. basemap, world-elevation, local viewing mode, camera, quality profile ve environment özelliklerini component'e verir.
4. `viewOnReady()` ile hazır olmasını bekler.
5. operational layer'ları `scene.map` üzerinden yönetir.

## Bileşen bağlantıları

Search, Home, Compass, Locate, Fullscreen, Legend, Basemap Gallery ve 3B analiz bileşenleri artık doğrudan bir SceneView nesnesi almaz.

Bunun yerine:

```ts
component.referenceElement = sceneElement;
```

kullanılır.

## Component-native event akışı

Runtime aşağıdaki DOM eventlerini kullanır:

- `arcgisViewClick`
- `arcgisViewPointerMove`
- `arcgisViewChange`
- `arcgisViewReadyError`

Identify, koordinat telemetrisi ve kamera kalıcılığı bu eventlerden beslenir.

## WebGL kurtarma

Scene component fatal render durumunda `tryFatalErrorRecovery()` çağrısını destekler. v13 bunu otomatik olarak dener ve sonucu Olay Günlüğü'ne `system` olayı olarak yazar.

Bu mekanizma tam yeniden yükleme garantisi değildir; WebGL context kaybı sürerse kullanıcı yeniden yükleme veya daha düşük performans profili kullanmalıdır.

## Korunan katman

Component-first geçiş şu yetenekleri değiştirmez:

- FeatureServer / SceneServer / MapServer / WMS / WFS adaptörleri
- race-safe latest-intent-wins layer orchestration
- bounded timeout
- scale-aware operational extents
- Query Studio
- Operations Intelligence
- incident journal
- adaptive safe mode
- PWA offline data cache

## Mimari guardrail

`tests/architecture.test.ts` v13 ile şu regresyonları engeller:

- `@arcgis/core/views/SceneView.js` doğrudan importu
- `new SceneView(...)`
- alt bileşenlere `element.view = ...` enjeksiyonu
- `arcgis-scene` / `referenceElement` yapısının kaybolması

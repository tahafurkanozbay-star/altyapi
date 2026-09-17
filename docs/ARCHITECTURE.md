# Mimari v2

## Katmanlar

**React UI** yalnızca kullanıcı durumu ve operasyon kabuğunu yönetir. **ArcGISRuntime** harita/SceneView yaşam döngüsünü, widget'ları, hitTest'i ve layer cache'ini tek yerde izole eder. **layerFactory** servis türünü ArcGIS layer sınıfına dönüştürür. **lib/** klasörü ArcGIS'ten bağımsız saf fonksiyonları içerir ve Vitest ile test edilir.

## Veri akışı

1. `services.json` yüklenir, servisler normalize edilir ve kararlı kimlik alır.
2. URL'den paylaşılmış durum varsa kamera/katman/altlık uygulanır; yoksa localStorage tercihleri kullanılır.
3. SceneView cihaz performans profiline göre başlatılır.
4. Yalnızca görünür servisler oluşturulur; diğer servisler kullanıcı açana kadar ağ isteği başlatmaz.
5. Layer `load()` sonucu `ready/error` olarak UI'a yansır.
6. `hitTest` sonucu React detay paneline güvenli metin verisi olarak aktarılır.
7. Kamera, tema, performans, katman görünürlüğü/saydamlığı ve yer imleri kalıcı tercihlere yazılır.

## Adaptörler

- FeatureServer → `FeatureLayer`
- SceneServer → `SceneLayer`
- MapServer → `MapImageLayer`; `/MapServer/{id}` uçlarında sublayer ID ayrıştırılır
- WMS → `WMSLayer`
- WFS → `WFSLayer`

## Arayüz prensibi

Harita tam ekran kalır; operasyon panelleri glass surface olarak overlay edilir. Ana katman paneli sağda, yüksek frekanslı harita araçları solda, geçici ArcGIS widget'ları ayrı araç panelinde bulunur. Mobilde tool rail alt dock'a dönüşür.

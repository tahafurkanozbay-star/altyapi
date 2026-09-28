# Service Runtime v23 — Katman kapsam navigasyonu

v23, v22 render-stall kurtarma hattının üzerine **provider extent farkındalığı** ekler. Amaç, bir katman teknik olarak yüklenmiş ve render-ready olsa bile kullanıcının kamerası veri kapsamının tamamen dışındaysa katmanı görünür bir başlangıç konumuna getirmektir.

## Aktivasyon politikası

- Otomatik kapsam düzeltmesi yalnız `svc-*` operasyon katmanlarında çalışır.
- Katmanın `fullExtent` değeri ile ArcGIS Scene bileşeninin güncel `extent` değeri karşılaştırılır.
- Kamera yalnız iki extent'in koordinat sistemi kesin olarak uyumluysa ve bounding-box'lar tamamen ayrık ise hareket eder.
- Mevcut görüntü katman kapsamıyla kesişiyorsa kullanıcı kamerasına dokunulmaz.
- WKID bilinmiyorsa veya provider/view farklı koordinat sistemlerindeyse sistem tahmin yapmaz; yanlış koordinata sıçramaktansa otomatik navigasyonu atlar.
- Web Mercator'ın 3857 / 102100 / 102113 / 900913 kodları aynı sistem olarak normalize edilir.
- Geçersiz, sıfır alanlı veya sonlu olmayan extent değerleri reddedilir.

## Kullanıcı kontrolünü koruma

Kapsam navigasyonu yalnız katmanın **görünmez → görünür** aktivasyon kenarında değerlendirilir. Katman açık kaldıktan sonra kullanıcı pan/zoom yaptığında watchdog haritayla savaşmaz.

Katman gizlenip yeniden açılırsa kapsam tekrar değerlendirilir. Bu davranış hem `Layer.visible` hem `LayerView.visible` değişimleri üzerinden izlenir.

v22'nin otomatik LayerView recycle işlemi görünür bir katmanı geçici olarak destroy/create edebilir. v23 bu geçici lifecycle olayını yeni kullanıcı aktivasyonu saymaz; dolayısıyla render recovery kamera sıçramasına neden olmaz.

## Çoklu aktivasyon

Birden fazla katman çok kısa aralıklarla aktive edilirse 120 ms debounce uygulanır. En son aktivasyon kamera hedefi olur. Böylece başlangıç restore/import gibi toplu akışlarda art arda gereksiz `goTo()` animasyonları azaltılır.

## Kamera hedefi

Provider extent, mümkünse `expand(1.12)` ile yaklaşık %12 çerçeve payı verilerek kullanılır. ArcGIS extent nesnesi `expand()` sağlamıyorsa ham provider extent güvenli fallback'tir.

Kapsam hareketinden sonra mevcut v18–v22 scale guard ve LayerView scale watchdog'ları çalışmaya devam eder. Böylece extent navigasyonu katmanın zorunlu `minScale/maxScale` politikasını devre dışı bırakmaz.

## TUCBS ve gizlilik

Bu mekanizma yalnız yüklü ArcGIS Layer nesnesinin `fullExtent` metadata'sını okur. TUCBS signed URL, token veya kimlik bilgisi okumaz, saklamaz ve loglamaz. Onaylı-IP erişim modeli aynen korunur.

## Dağıtım

- Uygulama sürümü: `23.0.0`
- PWA shell/data cache nesli: `v23`
- Extent karşılaştırma, Web Mercator alias'ları, bozuk metadata ve boot entegrasyonu otomatik testlerle korunur.

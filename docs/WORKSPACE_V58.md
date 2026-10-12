# v58: Gerçek çizim, hızlı katman etkileşimi ve strict araçlar

`Harita hazır` artık yalnız metadata başarısına göre gösterilmez. Açık katmanın
LayerView çizim sinyali yoksa hazırlık durumu devam eder; suspended LayerView hazır
sayılmaz. Yeni görünüm güncellenirken hazır sinyali geri çekilir ve çizim bitince
tekrar verilir. Böylece API yanıtı ile ekrandaki çizim birbirine karıştırılmaz.

Katman türünün SDK kodu fare/klavye niyeti üzerine background task olarak ısıtılır;
katman instance'ı oluşturulmaz ve sağlayıcı verisi indirilmez. Aynı türün tekrar
ısıtılması birleştirilir; offline, data saver, 2G, gizli sekme ve yoğun main thread
koşullarında çalışmaz. Mevcut ArcGIS layer cache kapatılan katmanı yeniden açarken
korunur. Cooldown bittiğinde retry düğmeleri başka kullanıcı işlemi gerekmeksizin
tekrar etkinleşir.

Mühendislik scriptlerinin tamamı `tsconfig.tooling.json` ile strict TypeScript
kontrolüne alındı. Ağ hataları unknown olarak daraltılır; katalog ve snapshot
sınırları runtime parser ile doğrulanır. Metadata raporları yalnız güvenli ölçek
alanlarını taşır; endpoint/token taşınmaz.

`npm run test:live`, production build üzerinde gerçek ArcGIS Scene, gerçek public
sağlayıcı verileri ve yazılım WebGL ile 10 kamu katmanını sırayla açar. Hazır
LayerView, visible/in-scale/settled durumu, SDK asset yanıtları, screenshot ve ilk
ile cache üzerinden yeniden açılış süreleri kaydedilir. Deterministik UI testleri
ayrı kalır. TUCBS'nin 10 korumalı katmanı yetkili URL ve onaylı istemci IP'si
olmadan public CI'da doğrulanamaz.

Yerel komutlar:

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:live
```

Canlı süreler upstream ağ ve donanıma bağlı gözlemlerdir; garanti edilen bir dış
servis gecikmesi değildir. CI `public-layer-timings.json` ve ekran görüntülerini
browser artifact'ında saklar.

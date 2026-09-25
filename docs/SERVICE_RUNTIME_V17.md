# Service Runtime v17 — Görsel Dayanıklılık ve Katman Failover

v17, Ankara Kent Rehberi'nin 20 katmanını iki hedef etrafında güçlendirir: **servis erişim dayanıklılığı** ve **yüksek görünürlüklü kartografi**.

## Mimari kararı

Uygulama ArcGIS Maps SDK for JavaScript 5.1 component-first mimarisinde çalışır. Bu SDK'nın doğal uygulama dili JavaScript/TypeScript olduğu için projeyi Rust, C++, Java veya benzeri bir dile taşımak tarayıcıdaki ArcGIS katmanları için ek bir köprü katmanı oluşturacak ve güvenilirliği azaltacaktır. Bu nedenle v17'de uygulama, testler ve servis bakım araçları tek bir **strict TypeScript** ekosisteminde tutulur.

`tsconfig.app.json` içinde `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules` ve bundler module resolution aktiftir. React 19, TypeScript 7, Vite 8 ve ArcGIS 5.1 component API korunur.

## Yüksek görünürlük sistemi

`src/gis/layerVisuals.ts`, servis adından semantik veri ailesini çıkarır ve gerçek geometry metadata yüklendikten sonra uygun renderer'ı seçer.

| Veri ailesi | Ana renk | Çizgi | Nokta | Davranış |
| --- | --- | ---: | ---: | --- |
| Doğalgaz | turuncu | 4.5 px | 12 px | WFS/feature geometriye client renderer |
| Yağmur suyu | camgöbeği | 4.25 px | 11.5 px | dynamic MapServer destekliyse client renderer |
| Pis su | kırmızı/pembe | 4.5 px | 11.5 px | dynamic MapServer destekliyse client renderer |
| İçme suyu | parlak mavi | 4.5 px | 11.5 px | dynamic MapServer destekliyse client renderer |
| İmar planı | mor profil | 3 px profil | 10.5 px | tematik sunucu kartografisi korunur |
| Sınırlar | canlı pembe | 3.75 px | 11 px | polygon fill yok; kalın sınır |
| 3B veri | turkuaz | 3 px | 10.5 px | Scene mesh mümkünse görünür edge |

Bütün katmanlar başlangıçta `opacity: 1` kullanır. Uydu/hibrit altlık üzerinde altyapı renklerinin kaybolmasını önlemek için blend mode `normal` tutulur.

WMS görüntüsü sunucu tarafından raster olarak üretildiğinden istemci tarafında tek tek çizgi kalınlığı değiştirilemez. Bu katmanlarda tam opak sunucu kartografisi korunur. Aynı veri WFS olarak da sunuluyorsa WFS taşıması client renderer ile çok daha görünür hale getirilebilir.

MapServer servislerinde renderer yalnız servis metadata'sı `supportsDynamicLayers` bildirdiğinde uygulanır. Legacy servis dynamic renderer kabul etmiyorsa katman yüklemesi başarısız yapılmaz; sunucunun kendi sembolojisi tam opak olarak korunur.

## Semantik WMS/WFS failover

`src/lib/catalog.ts`, aynı kurum + sahip + katman adına sahip WMS/WFS çiftlerini birbirinin eşdeğer taşıması olarak bağlar. `src/lib/serviceFailover.ts` bir mantıksal katman için deterministik aday listesi üretir.

Runtime v16'dan gelen "her retry'da fresh ArcGIS Layer" özelliği v17'de failover için kullanılır:

1. İlk deneme katalogdaki asli taşıma tipini kullanır.
2. Geçici ağ, timeout, 5xx veya OGC format hatası retry gerektirirse yeni ArcGIS Layer örneği oluşturulur.
3. Yeni örnek eşdeğer WMS/WFS taşımasına döner.
4. Başarılı yükleme sonrasında cursor sıfırlanır.
5. UI service id, scale guard, visibility state ve cache identity değişmez.

401/403, yetkilendirme ve yanlış TUCBS yapılandırması **retry edilmez**. Başka bir protokole geçmek erişim yetkisini aşmaya çalışmaz.

## 20 katmanlık çalışma matrisi

| # | Katman | Tür | v17 görünürlük / erişim politikası |
| ---: | --- | --- | --- |
| 1 | DOĞALGAZ DAĞITIM İSTASYONU | WMS | Tam opak WMS; transient/format sorunda WFS eşine failover |
| 2 | DOĞALGAZ DAĞITIM İSTASYONU | WFS | Turuncu 12 px nokta / geometriye göre renderer; WMS eşine failover |
| 3 | DOĞALGAZ DEPOLAMA TESİSİ | WFS | Turuncu yüksek kontrast renderer; WMS eşine failover |
| 4 | DOĞALGAZ DEPOLAMA TESİSİ | WMS | Tam opak WMS; WFS eşine failover |
| 5 | DOĞALGAZ HATTI | WMS | Tam opak WMS; WFS eşine failover |
| 6 | DOĞALGAZ HATTI | WFS | Turuncu 4.5 px hat; WMS eşine failover |
| 7 | DOĞALGAZ SERVİS KUTUSU | WFS | Turuncu 12 px nokta; WMS eşine failover |
| 8 | DOĞALGAZ SERVİS KUTUSU | WMS | Tam opak WMS; WFS eşine failover |
| 9 | DOĞALGAZ VANA | WFS | Turuncu 12 px nokta; WMS eşine failover |
| 10 | DOĞALGAZ VANA | WMS | Tam opak WMS; WFS eşine failover |
| 11 | YAĞMUR SUYU ELEMAN | MapServer | Camgöbeği; dynamic renderer desteklenirse kalın/nokta sembolü |
| 12 | YAĞMUR SUYU BORU | MapServer | Camgöbeği 4.25 px hat; dynamic renderer guard |
| 13 | PİS SU BORU | MapServer | Kırmızı/pembe 4.5 px hat; dynamic renderer guard |
| 14 | PİS SU ELEMAN | MapServer | Kırmızı/pembe belirgin nokta; dynamic renderer guard |
| 15 | İÇME SUYU ELEMAN | MapServer | Parlak mavi belirgin nokta; dynamic renderer guard |
| 16 | İÇME SUYU BORU | MapServer | Parlak mavi 4.5 px hat; dynamic renderer guard |
| 17 | UYGULAMA İMAR PLANI (UIP ESRI3) | MapServer | Karmaşık tematik plan renderer'ı korunur, tam opak |
| 18 | SINIRLAR | FeatureServer | Canlı pembe 3.75 px outline, polygon fill yok |
| 19 | 3D1234 WFL1 | FeatureServer | Turkuaz yüksek kontrast geometry renderer |
| 20 | 3D1234 WSL2 | SceneServer | Turkuaz 3B renderer; mesh için solid edge görünürlüğü |

## TUCBS onaylı-IP kuralı

Public repository imzalı/yetkili TUCBS endpoint'i içermez. `public/services.json` yalnız runtime sentinel adreslerini taşır. Gerçek endpoint'ler tarayıcıda kullanıcı tarafından tanımlanır ve `GetCapabilities` kullanıcının gerçek dış IP'sinden doğrulanır.

WMS/WFS failover yalnız **tanımlanmış ve yetkili** eş servis adresleri arasında çalışır; repository credential üretmez, saklamaz veya yayınlamaz.

## Ne garanti edilir, ne garanti edilemez?

v17; yanlış lifecycle, yarım yüklenmiş layer, transient bağlantı, timeout, 5xx, bazı OGC format uyumsuzlukları, düşük kontrast ve desteklenen dinamik renderer eksikliği gibi uygulama tarafındaki sorunları azaltır.

Harici kurum servisinin kapalı olması, CORS politikası, sertifika sorunu, credential süresinin dolması veya kaynak-IP yetkisinin kaldırılması uygulama koduyla garanti edilemez. Bu durumlarda kullanıcıya doğru hata sınıfı gösterilir ve gereksiz istek fırtınası üretilmez.

## Kalite kapısı

Merge öncesi aşağıdaki zincirin tamamı başarılı olmalıdır:

```bash
npm run check
```

Bu zincir servis katalog/health/navigation doğrulaması, strict TypeScript typecheck, Vitest ve production build doğrulamasını kapsar. PR ayrıca Node 22 + Node 24 CI ve CodeQL güvenlik taramasından geçmelidir.

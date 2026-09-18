# Başkent 3B CBS · Query Studio Platform v8

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini modern, göz konforuna odaklı beyaz bir çalışma alanında yönetir.

## v8: Query Studio + Portable Workspace

v8, v7'deki Comfort White ve ArcGIS Web Components mimarisini korurken kurumsal veri operasyonlarını ileri taşır.

- FeatureServer / SceneServer için **güvenli sunucu tarafı sorgu stüdyosu**
- alan tipine duyarlı filtre operatörleri
- string literal escaping ve yalnız servis şemasındaki alan adlarını kabul eden query builder
- sunucu tarafı sıralama ve gerçek sayfalama
- eşleşen toplam kayıt, sayfa aralığı ve aktif WHERE / ORDER BY görünümü
- mevcut sayfa üzerinde hızlı istemci araması ve CSV dışa aktarma
- **taşınabilir çalışma alanı paketleri**: kamera, altlık, görünürlük, saydamlık, favoriler ve yer imleri
- içe aktarmada yalnız mevcut katalogdaki servis kimliklerini kabul eden sanitizasyon
- gizli token / servis URL'si taşımayan JSON çalışma alanı formatı
- React 19.3 **ViewTransition** ile panel geçişleri
- v7 Comfort White tasarım sistemi ve ArcGIS 5.1 Web Components korunur

## Güncel teknoloji

- **React 19.3**
- **TypeScript 7.0.2**
- **Vite 8.3**
- **Vitest 5.0.1**
- **ArcGIS Maps SDK for JavaScript 5.1.24**
- **@arcgis/map-components 5.1.24**
- **Calcite Components 5.1.2**
- GitHub Actions — CI, CodeQL ve GitHub Pages
- same-origin PWA / service worker

Uygulamanın ana dili bilinçli olarak **TypeScript** kalır. Tarayıcı CBS uygulamasını Rust, Java veya C# gibi başka bir dile sırf değişiklik olsun diye taşımak; ArcGIS web ekosistemini zayıflatır, bundle/interop karmaşıklığını artırır ve bakım maliyetini yükseltir. v7'de yapılan gerçek dil/mimari modernizasyonu, dinamik/deprecated Widget API katmanını standart tabanlı Web Components + strict TypeScript kontratlarına taşımaktır.

## Yerel geliştirme

Bu proje düz HTML sitesi değildir. VS Code Live Server proje kökündeki `.tsx` kaynaklarını derleyemez.

```bash
npm install
npm run dev
```

Tarayıcı:

```text
http://127.0.0.1:4173/
```

Production önizleme:

```bash
npm run build
npm run preview
```

Live Server zorunluysa önce `npm run build` çalıştırın ve yalnız `dist/` klasörünü servis edin.

## Kalite kapısı

```bash
npm run check
```

Bu komut sırasıyla servis kataloğu doğrulaması, strict TypeScript, Vitest regresyon testleri, production build ve `dist/` smoke doğrulamasını çalıştırır.

## 3B operasyon yetenekleri

- Ankara merkezli SceneView + world elevation
- adaptive high / balanced / eco kalite profilleri
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- katman arama, kurum gruplama, servis türü filtresi ve favoriler
- görünürlük, saydamlık, zoom, retry
- Search / Home / Compass / Locate / Fullscreen ArcGIS Web Components
- kamera + katman + altlık paylaşım URL'si
- kamera ve aktif katmanları saklayan yer imleri
- PNG ekran görüntüsü
- **M: harita odak modu**

## Öznitelik Veri Atölyesi

FeatureServer ve SceneServer katmanları salt-okunur sorgulanabilir.

- 50 / 100 / 250 / 500 kayıt limiti
- geometri indirmeden öznitelik sorgusu
- alan alias bilgileri
- sütun görünürlüğü seçimi
- istemci tarafı arama
- Türkçe sayı / boolean gösterimi
- UTF-8 BOM CSV dışa aktarma
- toplam/yüklenen kayıt farkı uyarısı

Veri atölyesi sunucuya yazma veya edit işlemi yapmaz.

## 3B analiz araçları

v7 ile bu yüzeyler deprecated Widget sınıflarından ArcGIS Web Components'e taşınır:

- Legend
- Basemap Gallery
- Direct Line Measurement 3D
- Area Measurement 3D
- Daylight
- Slice
- Line of Sight
- Elevation Profile

Bileşenler ihtiyaç halinde lazy import edilir.

## Servis gözlemlenebilirliği

- ready / loading / error / idle durumu
- katman açılış süresi
- ortalama latency
- P95 latency
- en yavaş servislerin listesi
- son ölçüm zamanı
- toplu retry

## Sistem tanılama

- WebGL2
- CPU logical core
- tahmini bellek
- DPR
- bağlantı tipi / save-data
- color gamut
- secure-context
- performans skoru
- URL/token içermeyen JSON tanılama raporu

## Comfort White tasarım ilkeleri

- saf beyaz yerine çok hafif gri çalışma tuvali
- solid beyaz kart/panel yüzeyleri
- düşük alfa gölgeleri
- açık gri sınırlar
- mavi vurgu yalnız aktif/etkileşimli öğelerde
- 8–11 px eski yoğun yardımcı metinlerin kritik bölümlerinde daha okunaklı ölçek
- yüksek kontrast talebi için `prefers-contrast: more`
- animasyon hassasiyeti için `prefers-reduced-motion`
- focus-visible klavye halkaları
- mobilde solid white yüzeyler
- ArcGIS / Calcite bileşenlerinde aynı açık renk tokenları

Detay: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

## Kısayollar

- `Ctrl/Cmd + K` — komut paleti
- `L` — katman kataloğu
- `D` — sorgu stüdyosu
- `W` — çalışma alanı paketi
- `H` — Ankara başlangıç görünümü
- `M` — harita odak modu
- `F` — tam ekran
- `Esc` — açık araç/paneli kapat

## Güvenlik

Public bundle içine gizli token eklenmez. Token gerektiren WMS/WFS servisleri için sunucu tarafı same-origin proxy / token broker kullanılmalıdır. Öznitelik veri atölyesi de yalnız istemciye açık katalog servislerini kullanır.

- [SECURITY.md](SECURITY.md)
- [docs/SECURE_SERVICES.md](docs/SECURE_SERVICES.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Sürüm

Current application version: **8.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans/kullanım koşulları ayrıca geçerlidir.

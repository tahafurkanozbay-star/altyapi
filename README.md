# Başkent 3B CBS · Resilient Service Platform v9

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini modern, göz konforuna odaklı beyaz bir çalışma alanında yönetir.

## v9: Resilient Service Platform

v9, v8'in Query Studio ve Comfort White mimarisini korurken gerçek servis davranışını uygulama mimarisinin bir parçası haline getirir.

- katalogdan ayrı, URL/token içermeyen **service-health.json** sağlık snapshot'ı
- doğrulanmış / kısıtlı / ulaşılamıyor / bilinmiyor servis sınıflandırması
- GitHub Pages tarayıcı origin'i için CORS erişim profili
- doğrulanmış servisleri başlangıçta önceliklendiren akıllı yükleme politikası
- eski sağlık snapshot'larında 72 saat sonra otomatik güvenli gevşeme
- art arda hatalarda üstel geri çekilmeli **devre kesici**
- toplu retry sırasında doğrulanmış politika ve cooldown durumuna saygı
- katman kartlarında doğrulama, erişim profili, ölçüm zamanı ve devre kesici görünümü
- Servis Sağlığı panelinde harici doğrulama + canlı tarayıcı telemetrisi
- build sırasında katalog ve sağlık snapshot'ı tutarlılık doğrulaması
- manuel / zamanlanabilir, sanitizasyonlu servis sağlık probe scripti
- v8 sunucu tarafı Query Studio, taşınabilir çalışma alanları ve React View Transitions korunur

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

Bu komut sırasıyla servis kataloğu, servis sağlık snapshot'ı, strict TypeScript, Vitest regresyon testleri, production build ve `dist/` smoke doğrulamasını çalıştırır.

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

## Servis dayanıklılığı ve gözlemlenebilirliği

- harici doğrulama: verified / degraded / unavailable / unknown
- erişim profili: public-browser / browser-blocked / network-restricted / server-error
- canlı runtime: ready / loading / error / idle
- katman açılış süresi, ortalama latency ve P95
- başarısızlık sayacı, son hata zamanı ve cooldown
- üstel geri çekilmeli devre kesici
- 72 saatlik verification freshness politikası
- yalnız uygun servisleri toplu retry
- URL/token içermeyen tanılama ve health snapshot formatı

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

Current application version: **9.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans/kullanım koşulları ayrıca geçerlidir.


## Servis sağlık probe

Dış servislerin canlı durumunu yeniden ölçmek için:

```bash
npm run probe:services
npm run validate:health
```

Probe çıktısı yalnız servis adı/türü ve sanitizasyonlu durum bilgisi yazar; endpoint URL'lerini health snapshot'a kopyalamaz. Dış ağ koşulları nedeniyle ölçümler zamana ve çalıştırıldığı ağa göre değişebilir.

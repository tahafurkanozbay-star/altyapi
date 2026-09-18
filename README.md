# Başkent 3B CBS · Resilient Workspace Platform v8

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini göz konforlu beyaz bir çalışma alanında yönetir; gelişmiş öznitelik sorguları, servis telemetrisi ve taşınabilir kullanıcı çalışma alanları sunar.

## v8 platform yaklaşımı

v8'in odağı yalnız yeni ekran eklemek değil, uygulamayı **daha dayanıklı, taşınabilir ve doğrulanabilir** hale getirmektir.

- Comfort White kurumsal arayüz
- React 19 + strict TypeScript
- ArcGIS 5.1 Web Components
- native ESM `@arcgis/core`
- FeatureServer / SceneServer için güvenli sunucu tarafı filtreleme ve sıralama
- sayfalı öznitelik sorguları
- yerel hızlı arama + UTF-8 CSV
- sürümlü çalışma alanı JSON dışa/içe aktarma
- favori, saydamlık, kamera, altlık, katman görünürlüğü ve yer imlerinin taşınması
- servis açılış süresi, ortalama ve P95 telemetri
- browser-level Playwright E2E kalite kapısı
- Node 22 / Node 24 CI + Vitest + CodeQL + Pages

## Teknoloji

- **React 19.3**
- **TypeScript 7**
- **Vite 8.3**
- **Vitest 5**
- **Playwright**
- **ArcGIS Maps SDK for JavaScript 5.1 / `@arcgis/core`**
- **`@arcgis/map-components`**
- **Calcite Components**
- GitHub Actions
- PWA / Service Worker

### Neden başka bir programlama diline taşınmadı?

Tarayıcı tabanlı ArcGIS uygulamasını Rust, Java veya C# ile baştan yazmak bu proje için gerçek bir modernizasyon sağlamaz. ArcGIS web ekosistemi TypeScript/JavaScript ve Web Components merkezlidir. Bu nedenle v8'de “dil modernizasyonu” şu şekilde yapılmıştır:

- `strict` TypeScript kontratları
- raw SQL benzeri serbest sorgu yerine tipli sorgu modeli
- deprecated ArcGIS Widget sınıfları yerine standart Web Components
- domain yardımcılarını React bileşenlerinden ayırma
- lazy-loaded operasyon panelleri
- unit + browser E2E testleri

Bu yaklaşım runtime hata yüzeyini ve bakım maliyetini düşürürken ArcGIS ile doğal entegrasyonu korur.

## Yerel geliştirme

Bu proje düz HTML sitesi değildir. VS Code Live Server proje kökündeki `.tsx` dosyalarını derleyemez.

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

Live Server kullanılacaksa önce `npm run build` çalıştırılmalı ve yalnız `dist/` klasörü servis edilmelidir.

## Kalite komutları

```bash
npm run check
npm run test:e2e
```

`npm run check` servis kataloğu doğrulaması, strict TypeScript, Vitest, production build ve dist smoke kontrolünü çalıştırır.

`npm run test:e2e` production preview üzerinde Chromium tabanlı tarayıcı testlerini çalıştırır. E2E paketi özellikle geçmişte görülen **beyaz ekran / JavaScript boot regresyonlarını** yakalamak için eklenmiştir.

## Comfort White çalışma alanı

- açık gri `#f4f7f9` ana tuval
- beyaz panel ve kart yüzeyleri
- düşük kontrastlı gölgeler
- daha rahat tipografi ve panel boşlukları
- `prefers-reduced-motion`
- `prefers-contrast: more`
- güçlü `:focus-visible`
- mobilde solid-white yüzeyler
- ArcGIS / Calcite bileşenlerinde aynı açık renk token sistemi

`M` tuşu veya üst bardaki odak düğmesi panel yüzeylerini geri çekerek 3B sahneye daha fazla alan ayırır.

## Gelişmiş Öznitelik Veri Atölyesi

FeatureServer ve SceneServer katmanları salt-okunur sorgulanabilir.

### Sunucu sorgusu

- 50 / 100 / 250 / 500 kayıt sayfa boyutu
- güvenli alan whitelist'i
- eşittir / eşit değildir
- büyük / büyük-eşit / küçük / küçük-eşit
- içerir / ile başlar
- NULL / NOT NULL
- sayısal alanlarda sayı doğrulama
- string literal kaçışlama
- LIKE wildcard kaçışlama
- alan bazlı ASC / DESC sıralama
- gerçek sunucu toplam kayıt sayısı
- önceki / sonraki sayfa
- sorgu özeti

Kullanıcı doğrudan ham SQL yazamaz. Filtre alanı servis şemasından seçilir ve sorgu ifadesi tipli modelden üretilir.

### İstemci görünümü

- yüklenen sayfada anlık arama
- sütun görünürlüğü seçimi
- Türkçe sayı / boolean formatı
- UTF-8 BOM CSV dışa aktarma
- sticky tablo başlığı
- responsive tablo

Öznitelik sorguları geometri indirmez ve sunucuya edit/yazma işlemi yapmaz.

## Çalışma Alanı Yöneticisi

`W` kısayolu ile açılır.

### Dışa aktarılanlar

- altlık harita
- performans profili
- kamera
- katman görünürlüğü
- katman saydamlığı
- favoriler
- yer imleri

Çıktı sürümlü `baskent-3b-workspace` JSON belgesidir.

### İçe aktarma güvenliği

- en fazla 1 MB belge
- şema + sürüm kontrolü
- preference sanitizasyonu
- güvenli katman ID kontrolü
- kamera sınır doğrulaması
- opacity clamp
- Comfort White tema zorlaması
- token / servis URL query bilgisinin belgeye eklenmemesi

## 3B CBS yetenekleri

- Ankara merkezli SceneView
- world elevation
- high / balanced / eco kalite profilleri
- FeatureServer
- SceneServer
- MapServer
- WMS
- WFS
- katman arama ve kurum gruplama
- favoriler
- visibility / opacity / zoom / retry
- kamera + katman + altlık paylaşım URL'si
- yer imleri
- PNG ekran görüntüsü

## ArcGIS Web Components

Kullanıcıya dönük ArcGIS araçları component-first mimari kullanır:

- Search
- Home
- Compass
- Locate
- Fullscreen
- Legend
- Basemap Gallery
- Direct Line Measurement 3D
- Area Measurement 3D
- Daylight
- Slice
- Line of Sight
- Elevation Profile

Analiz bileşenleri gerektiğinde lazy import edilir.

## Servis gözlemlenebilirliği

- ready / loading / error / idle
- katman açılış süresi
- ortalama latency
- P95 latency
- en yavaş servislerin listesi
- son ölçüm zamanı
- toplu retry
- status dock latency sinyali

## Sistem tanılama

- WebGL2
- CPU logical core
- tahmini cihaz belleği
- DPR
- bağlantı tipi
- save-data
- color gamut
- secure-context
- performans skoru
- URL/token içermeyen JSON tanılama raporu

## Browser E2E kalite kapısı

GitHub Actions'taki **Browser E2E** workflow'u production build'i gerçek Chromium ortamında açar ve şunları doğrular:

- uygulama shell'i boş/beyaz ekran yerine render oluyor
- React boot marker oluşuyor
- Comfort White light color-scheme etkin
- komut paleti açılıyor
- çalışma alanı paneli açılıyor
- mobil görünümde veri atölyesi erişilebilir

Başarısız E2E çalışmasında Playwright report, trace/screenshot/video artifact'ları saklanır.

## Kısayollar

- `Ctrl/Cmd + K` — komut paleti
- `L` — katman kataloğu
- `D` — veri atölyesi
- `W` — çalışma alanı yöneticisi
- `H` — Ankara başlangıç görünümü
- `M` — harita odak modu
- `F` — tam ekran
- `Esc` — açık araç/paneli kapat

## Güvenlik

Public bundle içine gizli token eklenmez. Token gerektiren WMS/WFS servisleri için server-side same-origin proxy / token broker gerekir.

Workspace export ve tanılama çıktıları token içermez. Sorgu oluşturucu ham kullanıcı SQL'i kabul etmez.

Ayrıntılar:

- [SECURITY.md](SECURITY.md)
- [docs/SECURE_SERVICES.md](docs/SECURE_SERVICES.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

## Sürüm

Current application version: **8.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans / kullanım koşulları ayrıca geçerlidir.

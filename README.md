# Başkent 3B CBS · Adaptive Operations Platform v12

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini modern, göz konforuna odaklı beyaz bir çalışma alanında yönetir.

## v12: Adaptive Operations Platform

v12, v11 Runtime Reliability altyapısını operasyon seviyesinde daha otomatik ve açıklanabilir hale getirir.

- **Adaptif Güvenli Mod:** riskli / ulaşılamayan / devre kesicideki görünür katmanları tek hamlede izole eder
- sahne boş kalırsa en uygun doğrulanmış servislerden en fazla ikisini güvenli biçimde devreye alır
- son 1 saat için hata, uyarı, toparlanma, P95 olay süresi ve güvenilirlik trendi hesaplar
- Olay Günlüğü için zaman aralığı + önem + olay türü filtreleri
- kontrollü PWA güncelleme akışı: yeni sürüm hazır olduğunda kullanıcıya bildirilir, kullanıcı onayıyla yeni service worker aktive edilir
- service worker shell/data cache namespace'leri v12'ye taşındı
- servis ve health snapshot için network-first offline fallback korunur
- adaptif stabilizasyon ve reliability analytics için yeni regresyon testleri
- v11'in race-safe layer orchestration, bounded timeout ve sanitizasyonlu incident journal altyapısı korunur

Detay: [docs/ADAPTIVE_OPERATIONS.md](docs/ADAPTIVE_OPERATIONS.md)

## v11: Runtime Reliability Platform

v11, v10 Operations Intelligence katmanını korurken harita çalışma zamanındaki yarış koşullarını, uzun süren yüklemeleri ve tanılanması zor istemci hatalarını doğrudan mimari seviyede ele alır.

- aynı katmana üst üste aç/kapat isteklerinde **latest intent wins** görünürlük modeli
- eşzamanlı katman yüklemelerini tek promise altında birleştiren in-flight deduplication
- katman oluşturma, layer load ve öznitelik sorgularında bounded timeout
- stale async completion'ın yeni kullanıcı kararını geri çevirmesini engelleyen `superseded` sonucu
- retry sırasında devam eden yüklemeyi güvenli biçimde söndüren reload akışı
- URL/token/uzun secret benzeri değerleri maskelenen kalıcı **Olay Günlüğü**
- ağ, katman load, retry, query ve boot olaylarının en fazla 80 kayıtla saklanması
- olay günlüğünü güvenli JSON olarak dışa aktarma
- sol komuta rayında ve komut paletinde **Olay Günlüğü**
- `I` klavye kısayolu
- v11 PWA cache namespace rotasyonu

## v10 temeli

v10, v9'un dayanıklı servis orkestrasyonunu kullanıcıya doğrudan karar desteği veren bir operasyon görünümüne dönüştürür.

- uygulama açılışında varsayılan **Operasyon Özeti**
- harici doğrulama, CORS erişimi, canlı runtime, gecikme, ardışık hata ve devre kesici sinyallerini birleştiren deterministik **0–100 hazırlık endeksi**
- en riskli ve en güçlü servislerin otomatik sıralanması
- çalışma durumuna göre üretilen operasyon önerileri
- dış servis probe gecikmesinin sanitizasyonlu biçimde health snapshot'a eklenmesi
- katman detaylarında harici doğrulama gecikmesi
- Status Dock içinde canlı hazırlık puanı
- servis kataloğu ve health snapshot için **offline-safe network-first PWA cache**
- v9'un 72 saatlik freshness politikası, devre kesici ve güvenli retry kuralları korunur
- v8 Query Studio, taşınabilir çalışma alanları ve React View Transitions korunur

Hazırlık puanı bir SLA veya resmi hizmet seviyesi değildir; tarayıcı istemcisinin operasyon önceliklendirmesi için kullanılan açıklanabilir bir heuristiktir. Ayrıntı: [docs/OPERATIONS_INTELLIGENCE.md](docs/OPERATIONS_INTELLIGENCE.md)

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

Uygulamanın ana dili bilinçli olarak **TypeScript** kalır. Tarayıcı CBS uygulamasını Rust, Java veya C# gibi başka bir dile yalnızca "dil değişmiş olsun" diye taşımak ArcGIS web ekosistemini zayıflatır, bundle/interop karmaşıklığını artırır ve bakım maliyetini yükseltir. Modernizasyon; strict TypeScript kontratları, React 19.3 View Transitions, ArcGIS Web Components, güvenli query builder, PWA yaşam döngüsü, adaptif stabilizasyon ve tip güvenli operasyon intelligence katmanında ilerler.

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

## Query Studio

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
- katman açılış süresi, harici probe gecikmesi, ortalama latency ve P95
- başarısızlık sayacı, son hata zamanı ve cooldown
- üstel geri çekilmeli devre kesici
- 72 saatlik verification freshness politikası
- yalnız uygun servisleri toplu retry
- URL/token içermeyen tanılama ve health snapshot formatı
- servis bazlı açıklanabilir hazırlık puanı ve risk sinyalleri

## Operations Intelligence

- doğrulama + erişim + runtime + latency + failure sinyallerini birleştiren 0–100 hazırlık endeksi
- çok iyi / iyi / dikkat / kritik teknik sınıfları
- en zayıf 5 ve en güçlü 3 servisin görünümü
- çalışma durumuna göre operasyon önerileri
- doğrudan Katmanlar / Servis Sağlığı / Query Studio / Workspace geçişleri
- offline durumda son bilinen katalog ve sağlık snapshot'ı ile çalışma

## Adaptive Operations

- tek tıkla çalışma alanı stabilizasyon planı
- riskli görünür katmanların otomatik izolasyonu
- sahne boşsa doğrulanmış ve uygun servislerden sınırlı aktivasyon
- son 60 dakika güvenilirlik skoru ve trendi
- recovery rate, P95 incident süresi ve zaman penceresi analitiği
- incident panelinde zaman / önem / tür filtreleri
- controlled service-worker update ve kullanıcı onaylı yeni sürüm aktivasyonu

## Runtime reliability

- latest-intent-wins görünürlük politikası
- in-flight layer load deduplication
- 12 sn layer factory, 22 sn layer load ve 25 sn query üst sınırları
- yarış koşulu nedeniyle geçersiz kalan sonuçların `superseded` olarak işaretlenmesi
- retry sırasında güvenli layer teardown
- sanitizasyonlu persistent olay günlüğü
- olay türleri: boot / network / layer-load / layer-retry / query / system
- hata ve toparlanma geçmişinin JSON dışa aktarımı

Detay: [docs/RUNTIME_RELIABILITY.md](docs/RUNTIME_RELIABILITY.md)

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
- `O` — operasyon özeti
- `I` — olay günlüğü
- `L` — katman kataloğu
- `D` — sorgu stüdyosu
- `W` — çalışma alanı paketi
- `H` — Ankara başlangıç görünümü
- `M` — harita odak modu
- `F` — tam ekran
- `Esc` — açık araç/paneli kapat

## Güvenlik

Bu repo GitHub Pages üzerinde statik ve public çalışır. Bu nedenle `public/services.json` içindeki her değer tarayıcıya ve repo okuyucularına görünür kabul edilmelidir. Gizli/yenilenebilir kimlik bilgileri burada tutulmamalı; gerçek secret gerekiyorsa same-origin sunucu proxy / token broker kullanılmalıdır. Health snapshot ve tanılama raporları endpoint/token değerlerini tekrar etmez.

- [SECURITY.md](SECURITY.md)
- [docs/SECURE_SERVICES.md](docs/SECURE_SERVICES.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Sürüm

Current application version: **12.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans/kullanım koşulları ayrıca geçerlidir.


## Servis sağlık probe

Dış servislerin canlı durumunu yeniden ölçmek için:

```bash
npm run probe:services
npm run validate:health
```

Probe çıktısı yalnız servis adı/türü ve sanitizasyonlu durum bilgisi yazar; endpoint URL'lerini health snapshot'a kopyalamaz. Dış ağ koşulları nedeniyle ölçümler zamana ve çalıştırıldığı ağa göre değişebilir.

GitHub Pages workflow'u her production deploy öncesinde probe'u çalıştırır ve ayrıca her gün 03:17 UTC'de yeniden build/deploy yaparak yayınlanan sağlık snapshot'ını tazeler. CI kalite kontrolü ise dış ağ durumuna bağımlı olmamak için statik snapshot doğrulaması kullanır.

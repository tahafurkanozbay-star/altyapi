# Ankara Kent Rehberi

Ankara odaklı, vatandaş kullanımına göre sadeleştirilmiş; ArcGIS Maps SDK for JavaScript tabanlı profesyonel 3B kent rehberi. Uygulama kent ve altyapı katmanlarını, adres aramayı, ölçüm/3B analiz araçlarını, veri incelemeyi ve tekrar kurulabilir çalışma görünümlerini tek bir erişilebilir web uygulamasında birleştirir.

## v47 · Vatandaş odaklı güvenilirlik merkezi

v47, v46'nın **tarayıcı-otoriteli servis sağlık hafızasını** korur ve mevcut servis/runtime gözlemlenebilirliğini teknik operasyon ekranı olmaktan çıkarıp vatandaşın anlayabileceği **Bağlantı Durumu** bölümüne dönüştürür.

- çevrimiçi/çevrimdışı durum ile açık/hazır/sorunlu/doğrulanmış katman sayaçları
- dikkat gerektiren servislerin sade Türkçe açıklamalarla gösterilmesi
- tarayıcıda tutulan son ağ, katman, sorgu ve sistem olaylarının güvenli geçmişi
- aynı olay 30 saniye içinde tekrar ederse tek satırda birleştirme ve tekrar sayısı
- servis URL'si, token veya credential yazmayan indirilebilir destek/durum raporu
- runtime hata metinlerinin kullanıcıya gösterilmeden önce sanitizasyonu
- Bağlantı Durumu panelinin `React.lazy` + `Suspense` ile ihtiyaç anında yüklenmesi
- mobil, reduced-motion ve Windows forced-colors uyumlu v47 görünüm katmanı
- PWA shell/data cache neslinin v47'ye taşınması
- servis gözlem artifact yüklemesinin `actions/upload-artifact@v7` ile güncellenmesi

Ayrıntılar: `docs/CITIZEN_RELIABILITY_V47.md`. Tarayıcı-otoriteli health mimarisi: `docs/SERVICE_HEALTH_V46.md`.

## Teknoloji ve dil

- React 19.3
- strict TypeScript 7.0.2
- Vite 8.3.1
- Vitest 5
- ArcGIS Maps SDK for JavaScript 5.1.26
- `@arcgis/map-components` 5.1.26
- Calcite Components
- Typed Dedicated Worker + TypeScript Service Worker
- GitHub Pages + PWA
- Node 22/24 CI + CodeQL

Uygulama, worker'lar, service worker, testler ve servis bakım/audit araçlarının first-party kaynak kodu tek dilde **TypeScript** olarak tutulur. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `erasableSyntaxOnly` ve `verbatimModuleSyntax` guardrail'leri aktiftir. ArcGIS'in tarayıcı SDK'sıyla doğal uyumluluğu korumak için Rust/C++/C# gibi native bir dile sırf yeniden yazım amacıyla köprü eklemek yerine bütün mühendislik yüzeyi strict TypeScript üzerinde standardize edilmiştir.

## Servis kataloğu

`public/services.json` 20 katman tanımlar:

- 10 TUCBS / EPDK doğalgaz WMS-WFS katmanı
- 6 ABB yağmur suyu, pis su ve içme suyu MapServer katmanı
- Uygulama İmar Planı MapServer
- Sınırlar FeatureServer
- 3D1234 WFL1 FeatureServer
- 3D1234 WSL2 SceneServer

TUCBS servisleri kaynak IP sınırlandırmalı olduğu için imzalı/yetkili URL'ler repository veya build çıktısında tutulmaz. Yetkili servis JSON'u kullanıcının tarayıcısına tanımlanır, tarayıcı onaylı dış IP üzerinden `GetCapabilities` doğrulaması yapar ve URL yalnız local/session storage içinde saklanır.

## Harita ve servis dayanıklılığı

- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- tarayıcıda son 12 saatlik stabil LayerView sonucunu güvenli sağlık kanıtı olarak hatırlayan v46 browser-health katmanı
- semantic high-visibility cartography
- WMS/WFS eş servis failover
- 401/403 ve yanlış yapılandırmada yetkiyi aşmaya çalışan retry yapmama
- timeout sırasında gerçek ArcGIS `cancelLoad()` ve retry'da yeni Layer örneği
- provider-local circuit breaker ve adaptif retry politikası
- starvation-safe katman yükleme scheduler'ı
- tekil/batch atomik katman aktivasyonu
- provider/LayerView ölçek uzlaştırması ve sürekli scale guardrail
- WGS84 / Web Mercator kapsam farkındalığı
- event-driven çevrimdışı ve grafik kurtarma akışı
- günlük service-health ve scale audit workflow'u

## Vatandaş çalışma alanı

- masaüstünde 3B çalışma düzeni; mobilde safe-area uyumlu alt dock + bottom-sheet
- en az 44 px dokunma hedefleri ve görünür klavye focus ring'leri
- `prefers-reduced-motion`, `prefers-contrast: more` ve forced-colors desteği
- uzun katman listelerinde `content-visibility`
- sanal klavye / Visual Viewport farkındalığı
- Save-Data ve yavaş ağlarda daha hafif görsel efektler
- açık katmanlar için kalıcı top-to-bottom çizim sırası
- kamera + açık katman + saydamlık + çizim sırası + altlık içeren tam yer imleri
- erişilebilir native `<dialog>` ile yer imi adlandırma
- Web Share API; clipboard/adres çubuğu fallback'leri
- güvenli Fullscreen API kontrolü

## Bağlantı Durumu ve güvenli destek raporu

Bağlantı Durumu paneli teknik endpointleri kullanıcıya dökmez. Runtime olay günlüğü en fazla 80 kayıt tutar; URL ve secret-benzeri değerleri sanitize eder. v47, eşdeğer olayları 30 saniyelik bir pencere içinde tek kayda indirir ve `occurrences` sayısını artırır.

İndirilebilir durum raporunda yalnız servis adı/türü, çalışma durumu, doğrulama sınıfı, erişim sınıfı, görünürlük, güvenli gecikme/sayaç değerleri ve sanitizasyonlu olaylar bulunur. `url`, `tokenUrl`, endpoint veya credential alanları rapora yazılmaz.

## Geliştirme

Bu proje düz HTML sitesi değildir; kaynak `.tsx` dosyaları Vite ile derlenir.

```bash
npm install
npm run dev
```

Tarayıcı: `http://127.0.0.1:4173/`

Tam kalite kapısı:

```bash
npm run check
```

Bu komut dependency ve servis katalog doğrulaması, health/navigation snapshot doğrulaması, strict TypeScript typecheck, Vitest regresyon testleri, TypeScript service worker build'i ve production build smoke doğrulamasını çalıştırır.

Production önizleme:

```bash
npm run build
npm run preview
```

VS Code Live Server kullanmak zorundaysanız önce `npm run build` çalıştırın ve yalnız `dist/` klasörünü servis edin.

## Servis gözlemi

```bash
npm run probe:services
npm run audit:scales
```

Public GitHub runner, IP-kısıtlı TUCBS servislerini başarısız saymaz; bu servislerin gerçek erişim doğrulaması onaylı istemci IP'sinden yapılır. Sağlık ve ölçek raporları endpoint/token çıktısı üretmez.

## Kısayollar

- `L` — Katmanlar
- `D` — Harita verisi
- `H` — Ankara başlangıç görünümü
- `/` — adres/yer arama alanına git
- `?` — yardım
- `F` — tam ekran
- `M` — haritaya odaklan
- `Esc` — açık araç veya paneli kapat

## Güvenlik

- Public katalogda TUCBS credential/token bulunmaz.
- Sağlık, ölçek ve v47 destek raporlarında endpoint/token çıktılanmaz.
- TUCBS importu yalnız izin verilen TUCBS geoservice origin'lerini kabul eder.
- Yetkili servis URL'leri istemci tarayıcısı dışına gönderilmez.
- Semantik WMS/WFS failover yalnız tarayıcıda zaten yetkilendirilmiş endpoint'leri kullanır.
- Runtime kullanıcı mesajları ve olay kayıtları URL/secret-benzeri parçalar için sanitize edilir.

Güvenlik ayrıntıları için `SECURITY.md` ve `docs/SECURE_SERVICES.md` dosyalarına bakın.

## Sürüm

Current application version: **47.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans/kullanım koşulları ayrıca geçerlidir.

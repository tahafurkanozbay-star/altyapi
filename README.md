# Ankara Kent Rehberi

Ankara odaklı, vatandaş kullanımına göre sadeleştirilmiş; ArcGIS Maps SDK for JavaScript tabanlı 3B kent rehberi.

## Teknoloji

- React 19.3 + strict TypeScript 7
- Vite 8.3
- ArcGIS Maps SDK 5.1.26 component-first (`arcgis-scene`)
- Calcite Components 5.1
- Vitest 5
- GitHub Pages + PWA
- Node 22/24 CI ve CodeQL

Uygulama, testler, servis bakım/audit araçları ve Service Worker'ın bakım yapılan kaynak kodu tek dilde **TypeScript/TSX** olarak tutulur. Tarayıcıya verilmesi gereken `public/sw.js` build sırasında `worker/service-worker.ts` kaynağından otomatik üretilen JavaScript artifact'idir. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUncheckedSideEffectImports` ve modern ES2023 guardrail'leri aktiftir. ArcGIS'in tarayıcı SDK'sıyla doğal uyumluluğu korumak için native bir dile köprü eklemek yerine bütün first-party mühendislik yüzeyi TypeScript üzerinde standardize edilmiştir.

## v38 platform sertleştirmesi

v38 çalışma zamanı ve build zincirini birlikte güçlendirir:

- bütün doğrudan npm bağımlılıkları tam stabil sürümlere sabitlenir; React/React DOM ile ArcGIS core/map-components çiftleri birebir aynı sürümde tutulur
- `src`, `tests`, `scripts` ve `worker` altında elde yazılmış `.js/.jsx/.mjs/.cjs` kaynaklara kalite kapısı izin vermez
- servis bakım/audit scriptleri ayrı bir TypeScript project-reference altında typecheck edilir
- Service Worker strict WebWorker TypeScript kaynağından deterministik üretilir; package major sürümü ile PWA cache nesli otomatik eşleşir
- PWA shell/data cache boyutu sınırlandırılır; live katalog/health/navigation verileri network-first + `no-store` kalır
- navigation ve canlı veri isteklerine bounded network deadline eklenir; çevrimdışında mevcut cache fallback korunur
- katman yükleme scheduler'ında retry/restore işleri aging ile yükseltilir; yoğun etkileşim altında arka plan kurtarma işlerinin sonsuza kadar aç kalması engellenir
- scheduler yalnız yerel, anonim browser network sinyallerini kullanır; IP/token/credential saklamaz veya taşımaz
- browser/PWA metadata'sı Ankara Kent Rehberi ürün adı ve v38 ile eşlenir

Ayrıntılar: `docs/PLATFORM_V38.md`.

## Servis kataloğu

`public/services.json` 20 katman tanımlar:

- 10 TUCBS / EPDK doğalgaz WMS-WFS katmanı
- 6 ABB yağmur suyu, pis su ve içme suyu MapServer katmanı
- Uygulama İmar Planı MapServer
- Sınırlar FeatureServer
- 3D1234 WFL1 FeatureServer
- 3D1234 WSL2 SceneServer

TUCBS servisleri kaynak IP sınırlandırmalı olduğu için imzalı/yetkili URL'ler repository veya build çıktısında tutulmaz. Yetkili servis JSON'u kullanıcının tarayıcısına tanımlanır, tarayıcı onaylı dış IP üzerinden `GetCapabilities` doğrulaması yapar ve URL yalnız local/session storage içinde saklanır.

## Katman görünürlüğü ve dayanıklılık

Katman aktivasyonu tür bazlı adaptif çalışma politikasına, atomik zoom/kapsam navigasyonuna, LayerView render watchdog'larına, yüksek görünürlüklü semantik kartografiye ve OGC failover'a sahiptir:

- bütün katmanlarda varsayılan tam opaklık
- doğalgaz için turuncu, yağmur suyu için camgöbeği, pis su için kırmızı/pembe, içme suyu için parlak mavi
- altyapı hatlarında yaklaşık 4.25–4.5 px kalınlık; nokta/eleman katmanlarında 11.5–12 px semboller
- `SINIRLAR` için dolgusuz canlı pembe 3.75 px outline
- desteklenen 3B mesh katmanlarında belirgin edge
- MapServer renderer değişikliği yalnız servis `supportsDynamicLayers` bildirdiğinde
- karmaşık UIP tematik sembolojisi sunucunun kendi renk anlamını korur
- aynı veri için WMS/WFS çifti varsa geçici ağ, timeout, 5xx veya uygun OGC format hatasında kontrollü failover
- 401/403 ve yanlış yapılandırmada erişim yetkisini aşmaya çalışan retry yapılmaz
- her retry'da yeni ArcGIS Layer örneği; timeout/kapatma sırasında `cancelLoad()`
- layer başarıyla yüklenmeden canlı haritaya eklenmez
- katman açılırken canlı provider scale + extent + LayerView bilgisi tek atomik kamera kararında uzlaştırılır
- açık katmanın gerçek çalışma zoom aralığı aktifken korunur; katman kapanınca o kısıt kaldırılır
- ağ çevrimdışıyken yeni remote yükler kuyruğa alınır ve bağlantı/visibility değişiminde event-driven devam eder

Zoom ve render ayrıntıları için `docs/LAYER_SCALE_LOCKS_V18.md`, `docs/LAYERVIEW_SCALE_WATCHDOG.md` ve güncel platform belgelerine bakın.

## Geliştirme

```bash
npm install
npm run dev
```

Tam kalite kapısı:

```bash
npm run check
```

Bu komut typed Service Worker üretimi, kaynak-dil ve bağımlılık doğrulaması, servis katalog/health/navigation doğrulaması, bütün TypeScript project-reference'larının typecheck'i, Vitest ve production build doğrulamasını çalıştırır.

Servis gözlemi:

```bash
npm run probe:services
npm run audit:scales
```

Public GitHub runner, IP-kısıtlı TUCBS servislerini başarısız saymaz; bu servislerin gerçek erişim doğrulaması onaylı istemci IP'sinden yapılır.

## Güvenlik

- Public katalogda TUCBS credential/token bulunmaz.
- Sağlık ve ölçek raporlarında endpoint/token çıktılanmaz.
- TUCBS importu yalnız izin verilen `ucbp-api.tucbs.gov.tr` servis yollarını kabul eder.
- Yetkili servis URL'leri istemci tarayıcısı dışına gönderilmez.
- Semantik WMS/WFS failover yalnız tarayıcıda zaten yetkilendirilmiş endpoint'leri kullanır.
- PWA cache yalnız same-origin statik/data kaynaklarını yönetir; harici TUCBS/ABB servis yanıtlarını Service Worker cache'ine almaz.

Güvenlik ayrıntıları için `SECURITY.md` ve `docs/SECURE_SERVICES.md` dosyalarına bakın.

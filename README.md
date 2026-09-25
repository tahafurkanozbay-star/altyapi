# Ankara Kent Rehberi

Ankara odaklı, vatandaş kullanımına göre sadeleştirilmiş; ArcGIS Maps SDK for JavaScript tabanlı 3B kent rehberi.

## Teknoloji

- React 19 + strict TypeScript 7
- Vite 8
- ArcGIS Maps SDK 5.1 component-first (`arcgis-scene`)
- Calcite Components
- Vitest
- GitHub Pages + PWA
- Node 22/24 CI ve CodeQL

Uygulama, testler ve servis bakım/audit araçları tek dilde **TypeScript** olarak tutulur. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` ve `isolatedModules` guardrail'leri aktiftir. ArcGIS'in tarayıcı SDK'sıyla doğal uyumluluğu korumak için farklı bir native dile köprü eklemek yerine bütün first-party mühendislik yüzeyi strict TypeScript üzerinde standardize edilmiştir.

## Servis kataloğu

`public/services.json` 20 katman tanımlar:

- 10 TUCBS / EPDK doğalgaz WMS-WFS katmanı
- 6 ABB yağmur suyu, pis su ve içme suyu MapServer katmanı
- Uygulama İmar Planı MapServer
- Sınırlar FeatureServer
- 3D1234 WFL1 FeatureServer
- 3D1234 WSL2 SceneServer

TUCBS servisleri kaynak IP sınırlandırmalı olduğu için imzalı/yetkili URL'ler repository veya build çıktısında tutulmaz. Yetkili servis JSON'u kullanıcının tarayıcısına tanımlanır, tarayıcı onaylı dış IP üzerinden `GetCapabilities` doğrulaması yapar ve URL yalnız local/session storage içinde saklanır.

## v17 yüksek görünürlük ve servis dayanıklılığı

Katman aktivasyonu tür bazlı adaptif çalışma politikasına ek olarak semantik kartografi ve OGC taşıma failover kullanır:

- bütün katmanlarda varsayılan tam opaklık
- doğalgaz için turuncu, yağmur suyu için camgöbeği, pis su için kırmızı/pembe, içme suyu için parlak mavi
- altyapı hatlarında yaklaşık 4.25–4.5 px kalınlık
- nokta/eleman katmanlarında 11.5–12 px belirgin semboller
- `SINIRLAR` için dolgusuz canlı pembe 3.75 px outline
- 3B veri için turkuaz vurgu ve desteklenen mesh katmanlarında görünür edge
- MapServer renderer değişikliği yalnız servis `supportsDynamicLayers` bildirdiğinde; aksi halde sunucu sembolojisi tam opak korunur
- karmaşık UIP tematik sembolojisi zorla tek renge çevrilmez
- aynı veri için WMS/WFS çifti varsa geçici ağ, timeout, 5xx veya OGC format hatasında eşdeğer taşıma tipine kontrollü failover
- TUCBS katalog taşıması henüz ayarlanmamış ama eş WMS/WFS endpoint'i tarayıcıda ayarlıysa yapılandırılmış eş otomatik öne alınır
- 401/403 ve yanlış yapılandırma hatalarında erişim yetkisini aşmaya çalışan retry yapılmaz
- her retry'da yeni ArcGIS Layer örneği; timeout sırasında `cancelLoad()`
- layer başarıyla yüklenmeden canlı haritaya eklenmez
- WMS endpoint'i birden çok alt katman sunuyorsa katalog adına göre güvenli alt katman eşleştirmesi yapılır
- mevcut zoom/extent guardrail, cache pruning ve görünürlük yarış korumaları korunur

Ayrıntılar ve 20 katmanlık çalışma matrisi: `docs/SERVICE_RUNTIME_V17.md`.

## Geliştirme

```bash
npm install
npm run dev
```

Tam kalite kapısı:

```bash
npm run check
```

Bu komut servis katalog doğrulaması, health/navigation snapshot doğrulaması, TypeScript typecheck, Vitest ve production build doğrulamasını çalıştırır.

Servis gözlemi:

```bash
npm run probe:services
npm run audit:scales
```

Public GitHub runner, IP-kısıtlı TUCBS servislerini başarısız saymaz; bu servislerin gerçek erişim doğrulaması onaylı istemci IP'sinden yapılır.

## Güvenlik

- Public katalogda TUCBS credential/token bulunmaz.
- Sağlık ve ölçek raporlarında endpoint/token çıktılanmaz.
- TUCBS importu yalnız `https://ucbp-api.tucbs.gov.tr/geoservice/spatial/` adreslerini kabul eder.
- Yetkili servis URL'leri istemci tarayıcısı dışına gönderilmez.
- Semantik WMS/WFS failover yalnız tarayıcıda zaten yetkilendirilmiş endpoint'leri kullanır.

Güvenlik ayrıntıları için `SECURITY.md` ve `docs/SECURE_SERVICES.md` dosyalarına bakın.

# Ankara Kent Rehberi

Ankara odaklı, vatandaş kullanımına göre sadeleştirilmiş; ArcGIS Maps SDK for JavaScript tabanlı 3B kent rehberi.

## Teknoloji

- React 19 + strict TypeScript
- Vite 8
- ArcGIS Maps SDK 5.1 component-first (`arcgis-scene`)
- Calcite Components
- Vitest
- GitHub Pages + PWA
- Node 22/24 CI ve CodeQL

Uygulama, testler ve servis bakım/audit araçları v16 ile tek dilde **TypeScript** olarak tutulur. Node tarafındaki araçlar `tsx` ile doğrudan çalıştırılır.

## Servis kataloğu

`public/services.json` 20 katman tanımlar:

- 10 TUCBS / EPDK doğalgaz WMS-WFS katmanı
- 6 ABB yağmur suyu, pis su ve içme suyu MapServer katmanı
- Uygulama İmar Planı MapServer
- Sınırlar FeatureServer
- 3D1234 WFL1 FeatureServer
- 3D1234 WSL2 SceneServer

TUCBS servisleri kaynak IP sınırlandırmalı olduğu için imzalı/yetkili URL'ler repository veya build çıktısında tutulmaz. Yetkili servis JSON'u kullanıcının tarayıcısına tanımlanır, tarayıcı onaylı dış IP üzerinden `GetCapabilities` doğrulaması yapar ve URL yalnız local/session storage içinde saklanır.

## v16 servis çalışma modeli

Katman aktivasyonu artık tür bazlı adaptif çalışma politikası kullanır:

- WMS/WFS/MapServer/FeatureServer/SceneServer için ayrı timeout ve retry bütçeleri
- Ölçülmüş servis gecikmesine göre dinamik timeout
- TUCBS OGC servisleri için daha geniş ama sınırlı yükleme bütçesi
- 401/403 ve yapılandırma hatalarında gereksiz tekrar yok
- timeout, ağ ve 5xx hatalarında exponential backoff + deterministic jitter
- her retry'da yeni ArcGIS Layer örneği
- timeout sırasında `cancelLoad()`
- layer başarıyla yüklenmeden canlı haritaya eklememe
- WMS endpoint'i birden çok alt katman sunuyorsa katalog adına göre güvenli alt katman eşleştirme
- mevcut zoom/extent guardrail, cache pruning ve görünürlük yarış korumalarının korunması

Ayrıntılar: `docs/SERVICE_RUNTIME_V16.md`.

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

Güvenlik ayrıntıları için `SECURITY.md` ve `docs/SECURE_SERVICES.md` dosyalarına bakın.

# Platform v38

v38 Ankara Kent Rehberi'nin uygulama kodu kadar build, PWA ve katman yükleme altyapısını da aynı kalite sınırına taşır.

## Tek first-party kaynak dili

Bakım yapılan first-party kaynaklar `src/`, `tests/`, `scripts/` ve `worker/` altında TypeScript/TSX'tir. Tarayıcı Service Worker API'si JavaScript dosyası istediği için `public/sw.js` elle düzenlenen kaynak değildir; `worker/service-worker.ts` dosyasından `scripts/generate-service-worker.ts` ile üretilen artifact'tir.

TypeScript project references:

- `tsconfig.app.json`: React, GIS runtime ve testler
- `tsconfig.node.json`: Vite yapılandırması
- `tsconfig.tools.json`: servis doğrulama, health/scale audit ve build araçları
- `tsconfig.worker.json`: WebWorker ortamındaki Service Worker kaynağı

`validate:source`, first-party kaynak ağaçlarında elde yazılmış `.js`, `.jsx`, `.mjs` veya `.cjs` bulunmasına izin vermez.

## Deterministik bağımlılık zinciri

Doğrudan dependencies ve devDependencies tam stabil sürümlere sabitlenir. ArcGIS core ile map-components aynı sürümde, React ile React DOM aynı sürümde olmak zorundadır. Prerelease veya git/http/file tabanlı doğrudan dependency kalite kapısını geçemez.

Bu kural transitive registry çözümlemesinin tamamını lockfile yerine geçirmez; doğrudan platform yüzeyinde istemsiz semver drift'ini kaldırır.

## Typed ve bounded PWA cache

Service Worker kaynak kodu strict WebWorker TypeScript'tir. Build sırasında package major sürümü cache adına işlenir ve `verify-build` bunu production çıktısında tekrar doğrular.

v38 cache politikası:

- shell cache üst sınırı: 96 kayıt
- data cache üst sınırı: 16 kayıt
- live katalog/health/navigation: network-first + `cache: no-store`
- live data network deadline: 12 saniye
- navigation network deadline: 9 saniye
- preload başarısızlığı normal timed fetch'e düşer
- precache girişleri `Promise.allSettled` ile bağımsızdır; tek opsiyonel dosya install işlemini bütünüyle kırmaz
- same-origin dışı ArcGIS/TUCBS/ABB servis cevapları Service Worker tarafından cache'lenmez

## Starvation-safe GIS load scheduler

v37 scheduler ağ çevrimdışıyken admission'ı durduruyor ve online/visibility/network change olaylarında kuyruğu event-driven uyandırıyordu. v38 buna bekleme yaşlandırması ekler.

Öncelikler:

- `interactive`: kullanıcı doğrudan açtı
- `retry`: açıkça yeniden deneme
- `restore`: başlangıç, yer imi veya restore işi

Aging politikası:

- retry 15 saniye beklerse interactive sınıfına yükselir
- restore 12 saniye beklerse retry sınıfına yükselir
- restore 30 saniye beklerse interactive sınıfına yükselir

Yükseltilen işler FIFO sırasına döner. Normal restore seviyesinde sağlık/latency risk sıralaması korunur. Böylece sağlıksız provider başlangıç yükünü geciktirmeye devam ederken sürekli yeni kullanıcı etkileşimi arka plan restore/recovery işlerini sonsuza kadar aç bırakamaz.

OGC WMS/WFS host başına seri çalışma kuralı ve weighted global cost politikası değişmez.

Scheduler `diagnostics()` yalnız process içi anonim sayısal durum döndürür: active, activeCost, queued, effectiveLimit, pausedByNetwork, oldestQueuedMs ve activeLanes. URL, token, IP veya credential içermez.

## Kalite kapısı

`npm run check` sırası:

1. typed Service Worker üretimi
2. first-party kaynak dil doğrulaması
3. dependency coherence
4. servis kataloğu / health / navigation doğrulamaları
5. bütün TypeScript project-reference'larının typecheck'i
6. Vitest
7. production build ve build artifact doğrulaması

CI Node 22 ve Node 24 üzerinde aynı kapıyı çalıştırır. CodeQL ayrı güvenlik hattıdır. GitHub Pages production build de kalite kapısını yeniden çalıştırır.

## Servis güvenliği

Bu sürüm TUCBS yetkilendirme modelini değiştirmez. IP-kısıtlı ve signed endpoint'ler public repo, build, CI health snapshot veya Service Worker cache'ine taşınmaz. Gerçek TUCBS doğrulaması onaylı istemci IP'sinden tarayıcıda yapılmaya devam eder.

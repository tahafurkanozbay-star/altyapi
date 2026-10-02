# Citizen Reliability v46

v46, Ankara Kent Rehberi'nin mevcut v45 çalışma görünümü ve servis/runtime çekirdeğini bozmadan gözlemlenebilirliği vatandaşın anlayabileceği bir yüzeye taşır.

## Amaç

Önceki sürümlerde olay günlüğü, servis health snapshot'ı ve circuit-breaker bilgisi mühendislik katmanında zaten vardı. v46 bu verileri endpoint, token veya kurum içi teknik ayrıntı göstermeden **Bağlantı Durumu** panelinde birleştirir.

Bu panel bir NOC/SOC ekranı değildir. Amaç kullanıcının şu üç soruya hızlı cevap almasıdır:

1. İnternet bağlantım var mı?
2. Harita katmanlarının kaçı hazır veya sorunlu?
3. Sorun tekrar ediyorsa destek için güvenli bir rapor indirebilir miyim?

## Olay fırtınası tekilleştirme

`src/lib/incidentJournal.ts` aynı `severity`, `kind`, sanitizasyonlu `message`, `serviceId` ve `recovered` değerlerine sahip olayları 30 saniyelik pencere içinde tek kayda indirir. En yeni zaman korunur ve `occurrences` sayısı artırılır.

Bu yaklaşım özellikle kesintili ağ veya aynı anda çok sayıda layer retry olduğunda localStorage günlüğünün aynı hatayla dolmasını önler. Günlük üst sınırı 80 kayıt olarak kalır.

## Güvenli destek raporu

`src/lib/supportReport.ts` yalnız tanılama için gerekli güvenli alanları dışa aktarır:

- servis adı ve türü
- runtime durumu
- doğrulama ve erişim sınıfı
- görünürlük
- bounded latency ve failure count
- doğrulama zamanı/freshness
- sanitizasyonlu incident kayıtları

Rapor şemasında `url`, `tokenUrl`, endpoint, access token veya credential alanı yoktur. Servis tanımında bu değerler mevcut olsa dahi serializer bunları rapora taşımaz.

## Kullanıcı arayüzü

`CitizenStatusCenter` `React.lazy` ile yalnız `health` paneli açıldığında yüklenir. Panel:

- online/offline hero durumu,
- açık/hazır/sorunlu/doğrulanmış sayaçları,
- son servis doğrulama zamanı,
- en fazla 8 dikkat gerektiren katman,
- en fazla 20 son olay,
- tekrar sayısı,
- güvenli rapor indirme,
- iki aşamalı geçmiş temizleme

sunmaktadır.

Teknik `Operasyon Merkezi`, endpoint ve ham credential bilgisi vatandaş arayüzüne geri getirilmez.

## Erişilebilirlik ve responsive davranış

`experience-v46.css` önceki citizen CSS katmanlarının üzerine yüklenir. Yeni panel:

- mobilde iki sütunlu özet kartlarına,
- geniş dokunma hedeflerine,
- uzun içerikte `content-visibility`,
- `prefers-reduced-motion`,
- Windows `forced-colors`,
- mevcut focus-visible ve safe-area davranışlarına

uyumludur.

## PWA ve sürümleme

Uygulama sürümü `46.0.0`; TypeScript service worker cache nesli `altyapi-shell-v46` / `altyapi-data-v46` olarak döndürülür. Eski `altyapi-*` cache'leri activate aşamasında temizlenir. `services.json`, `service-health.json` ve `service-navigation.json` network-first/no-store davranışını korur.

## Dil kararı

v46'da first-party uygulama, worker, service worker, test ve bakım araçları strict TypeScript 7 olarak kalır. ArcGIS web SDK'sını farklı bir native dile zorla taşımak yerine type-safe Web Components, Dedicated Worker, runtime validation, PWA ve test guardrail'leri güçlendirilir.

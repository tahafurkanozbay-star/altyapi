# Citizen Reliability v47

v47, Ankara Kent Rehberi'nin v46 tarayıcı-otoriteli service-health ve v45 çalışma görünümü altyapısını bozmadan gözlemlenebilirliği vatandaşın anlayabileceği bir yüzeye taşır.

## Amaç

Olay günlüğü, servis health snapshot'ı, browser-health hafızası ve circuit-breaker bilgisi mühendislik katmanında zaten mevcuttur. v47 bu sinyallerin güvenli bir alt kümesini endpoint, token veya kurum içi teknik ayrıntı göstermeden **Bağlantı Durumu** panelinde birleştirir.

Panel şu sorulara cevap verir:

1. İnternet bağlantım var mı?
2. Harita katmanlarının kaçı hazır veya sorunlu?
3. Hangi katman dikkat gerektiriyor?
4. Sorun tekrar ediyorsa destek için güvenli bir rapor indirebilir miyim?

## v46 browser-health ile ilişki

`browserServiceHealth` son 12 saat içinde aynı tarayıcıda stabil render olmuş public katmanları anonim `serviceId` ile hatırlar. v47 bunu değiştirmez; aksine Bağlantı Durumu paneli runtime ve snapshot sınıflarını vatandaş diline çevirirken v46'nın otorite sırasını korur. TUCBS approved-IP health profili yine ayrı otoritedir.

## Olay fırtınası tekilleştirme

`src/lib/incidentJournal.ts` aynı `severity`, `kind`, sanitizasyonlu `message`, `serviceId` ve `recovered` değerlerine sahip olayları 30 saniyelik pencere içinde tek kayda indirir. En yeni zaman korunur ve `occurrences` sayısı artırılır.

Bu yaklaşım kesintili ağ veya aynı anda çok sayıda layer retry olduğunda localStorage günlüğünün aynı hatayla dolmasını önler. Günlük üst sınırı 80 kayıt olarak kalır.

## Güvenli destek raporu

`src/lib/supportReport.ts` yalnız tanılama için gerekli güvenli alanları dışa aktarır:

- servis adı ve türü
- runtime durumu
- doğrulama ve erişim sınıfı
- görünürlük
- bounded latency ve failure count
- doğrulama zamanı/freshness
- sanitizasyonlu incident kayıtları ve tekrar sayısı

Rapor şemasında `url`, `tokenUrl`, endpoint, access token veya credential alanı yoktur. Servis tanımında bu değerler mevcut olsa dahi serializer bunları rapora taşımaz.

## Kullanıcı arayüzü

`CitizenStatusCenter` `React.lazy` ile yalnız `health` paneli açıldığında yüklenir. Panel online/offline hero durumu, servis sayaçları, son doğrulama zamanı, en fazla 8 dikkat gerektiren katman, en fazla 20 son olay, tekrar sayısı, güvenli rapor indirme ve iki aşamalı geçmiş temizleme sağlar.

Ham runtime hata metni kullanıcıya yazılmadan önce `sanitizeIncidentText` üzerinden geçirilir. Teknik `Operasyon Merkezi`, endpoint ve credential bilgisi vatandaş arayüzüne geri getirilmez.

## Erişilebilirlik ve responsive davranış

`experience-v47.css` önceki citizen CSS katmanlarının üzerine yüklenir. Yeni panel mobilde iki sütunlu özet kartları, uzun içerikte `content-visibility`, `prefers-reduced-motion`, Windows `forced-colors` ve mevcut focus-visible/safe-area davranışlarıyla uyumludur.

## PWA ve sürümleme

Uygulama sürümü `47.0.0`; TypeScript service worker cache nesli `altyapi-shell-v47` / `altyapi-data-v47` olarak döndürülür. Eski `altyapi-*` cache'leri activate aşamasında temizlenir. `services.json`, `service-health.json` ve `service-navigation.json` network-first/no-store davranışını korur.

## Dil kararı

v47'de first-party uygulama, worker, service worker, test ve bakım araçları strict TypeScript 7 olarak kalır. ArcGIS web SDK'sını farklı bir native dile zorla taşımak yerine type-safe Web Components, Dedicated Worker, runtime validation, PWA ve test guardrail'leri güçlendirilir.

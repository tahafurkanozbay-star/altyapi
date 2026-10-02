# Ankara Kent Rehberi · Product Integrity v48

v48, v47'deki responsive ve erişilebilir vatandaş deneyimini korurken sayfanın durum yönetimini, klavye/odak yaşam döngüsünü, PWA kurulabilirliğini ve TypeScript kalite sınırlarını daha deterministik hale getirir.

## Dil ve mimari

First-party uygulama, GIS runtime, Web Worker, Service Worker kaynağı, mühendislik scriptleri ve testler strict TypeScript 7 üzerinde kalır. ArcGIS Maps SDK for JavaScript ve React doğrudan tarayıcı JavaScript çalışma zamanı üzerinde çalıştığı için başka bir dile toplu taşıma yerine TypeScript sözleşmeleri daha da sıkılaştırılır. JavaScript olarak repoda tutulan tek first-party çıktı `public/sw.js` olup `src/sw/sw.ts` kaynağından üretilir.

v48 ile uygulama ve Node yapılandırmalarında kullanılmayan local/parametre denetimi ile dosya adı büyük-küçük harf tutarlılığı CI seviyesine taşınır. Böylece ölü kod ve platformlar arası casing sapmaları merge öncesinde yakalanır.

## Ürün bütünlüğü

- PWA kurulabilir tarayıcılarda native `beforeinstallprompt` akışı typed React host üzerinden yakalanır; desteklemeyen tarayıcılarda hiçbir ek chrome gösterilmez.
- Kurulum önerisi yalnız uygun olduğunda görünür, standalone modunda gizlenir ve kullanıcı aynı oturum için kapatabilir.
- Harita araçları açılıp kapanırken klavye odağı araç paneline ve tetikleyen düğmeye güvenilir biçimde taşınır. Panel ve harita aracı focus yaşam döngüleri birbirinden ayrıdır.
- ToolRail harita araçları typed `data-tool-target` işaretleri taşır; one-shot araçlar toggle semantiğine dönüşmez.
- Öznitelik Sorgu Stüdyosu geç gelen eski sorgu yanıtlarının yeni servis seçimini ezmesini engelleyen request-generation guard kullanır.
- Veri paneli `aria-busy` durumunu dışarı verir; tablo başlıkları uzun sonuç listelerinde sticky kalır ve mobil sorgu kontrolleri tek kolona düşer.
- CSV indirme Object URL yaşam döngüsü tıklama sonrasında güvenli biçimde temizlenir.
- Reduced-motion, forced-colors ve reduced-transparency davranışları yeni install/data UI için de korunur.

## Regresyon korumaları

`tests/citizenExperienceV48.test.ts` PWA install host'u, map-tool focus sözleşmesini, stale-query korumasını, v48 CSS yükleme sırasını ve daha sıkı TypeScript derleyici bayraklarını kilitler. Mevcut v47 testleri yeni deneyim neslinde önceki erişilebilirlik davranışlarının korunmasını doğrulamaya devam eder.

Paket major sürümü ve PWA cache generation birlikte `48` olarak döndürülür; `tests/releaseCoherence.test.ts` sürüm/cache eşleşmesini doğrulamaya devam eder.

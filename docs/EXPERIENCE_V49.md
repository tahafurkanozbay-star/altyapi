# Ankara Kent Rehberi · Platform Usability v49

v49, v48'in responsive vatandaş deneyimini ve çalışan GIS servis/runtime zincirini korurken uygulamanın tamamındaki platform yaşam döngüsü, hata kurtarma, bildirim geometrisi ve TypeScript sözleşmelerini sıkılaştırır.

## Dil ve platform kararı

ArcGIS Maps SDK 5.1, React 19.3, Vite 8.3 ve tarayıcı/PWA çalışma zamanı için first-party kaynak dili strict TypeScript 7 olarak kalır. Native bir dile toplu yeniden yazım, ArcGIS web component ve browser API yüzeylerine FFI/WASM katmanı ekleyerek hata yüzeyini büyüteceğinden yapılmaz. Bunun yerine uygulama, Node tooling, Dedicated Worker ve Service Worker TypeScript projelerinde `exactOptionalPropertyTypes` ve `noPropertyAccessFromIndexSignature` dahil daha katı derleyici semantiği kullanılır.

`public/sw.js` yalnız `src/sw/sw.ts` kaynağından üretilen deployment çıktısıdır; kaynak-of-truth değildir.

## Typed platform yaşam döngüsü

Uygulama-içi PWA güncelleme ve runtime hata sinyalleri artık stringly `window` eventleri yerine `RuntimeEventMap` içindeki typed event bus üzerinden taşınır:

- `pwa-update-available`
- `pwa-apply-update`
- `app-runtime-fault`

ArcGIS'in kendi DOM eventleri SDK sınırında kalır. TUCBS token/signed URL bilgileri yeni platform olaylarının payload'ına alınmaz.

## Kullanıcıya güvenli hata kurtarma

- Global `error` ve `unhandledrejection` olaylarının ham ayrıntıları yalnız geliştirici konsolunda kalır.
- Kullanıcıya teknik URL/token/error-string yerine güvenli ve eyleme dönük bir kurtarma mesajı gösterilir.
- Service Worker kaydı başarısızsa canlı haritanın kullanılabileceği açıkça belirtilir.
- React Error Boundary üretimde raw exception metni göstermemeye başlar; yeniden yükleme ve yerel tercihleri sıfırlama seçenekleri korunur.
- Geliştirici stack trace'i yalnız development build'de görünür.

## Çakışmasız sistem bildirimleri

PWA kurulum önerisi, uygulama güncellemesi ve runtime kurtarma bildirimi tek `PlatformStatusHost` altında sıralanır. Masaüstünde bağlantı bildirimi ters köşeyi kullanır; mobilde kalıcı çevrimdışı uyarısı arama alanının altına taşınır. Böylece install/update/offline banner'ları aynı alt koordinata bindirilmez.

Yeni katman:

- safe-area uyumludur,
- reduced-transparency tercihini takip eder,
- forced-colors modunda sistem renklerini kullanır,
- mobilde bounded scroll alanı kullanarak harita kontrollerini tamamen kapatmaz.

## Kod temizliği

Public App ve ToolRail tarafından yıllardır kullanılmayan eski `CommandPalette.tsx` kaynağı kaldırılır. Teknik operasyon yüzeyleri vatandaş kabuğuna geri getirilmez; mühendislik servis sağlığı ve runtime dayanıklılık katmanları arka planda çalışmaya devam eder.

## Release

Paket major sürümü ve PWA shell/data cache generation birlikte v49'a döndürülür. `tests/citizenExperienceV49.test.ts` typed platform eventlerini, bildirim geometrisini, TypeScript guardrail'lerini, ölü komut paleti kodunun kaldırılmasını ve güvenli fatal recovery yüzeyini kilitler.

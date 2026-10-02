# Ankara Kent Rehberi · Citizen Experience v47

v47, GIS servis çalışma zincirini değiştirmeden sayfanın tamamındaki vatandaş deneyimini ve etkileşim güvenliğini sıkılaştırır.

## Dil ve platform kararı

Uygulamanın first-party kaynakları strict TypeScript 7 üzerinde kalır. ArcGIS Maps SDK for JavaScript / Map Components, React ve tarayıcı PWA yaşam döngüsü doğrudan JavaScript çalışma zamanı üzerinde çalıştığı için Rust/C++/başka bir dile toplu taşıma; ekstra WASM/FFI köprüleri, daha büyük bundle ve ArcGIS API uyumsuzluğu üretirdi. Bu nedenle modernizasyon hedefi dil değiştirmek değil, bütün first-party uygulama/worker/test/mühendislik kodunu typed TypeScript sınırlarında tutmaktır. `public/sw.js` yalnız `src/sw/sw.ts` kaynağından üretilen deployment çıktısıdır.

## Ürün genelindeki değişiklikler

- Üst çubuk beş gerçek içerik grubuna karşılık beş grid kolonu kullanır; 1280 px ve 1020 px altında ikincil chrome kademeli olarak azaltılır.
- Mobil header üç mantıksal track kullanır: menü, marka, eylemler. Arama kendi tam-genişlik satırında kalır.
- PWA standalone modunda safe-area top/right/bottom/left değerleri dikkate alınır.
- Mobil araç rail'i yatay pan/scroll-snap davranışıyla tek elle daha öngörülebilir kullanılır.
- `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`, pointer/hover kabiliyeti, standalone display mode ve görsel viewport sinyalleri merkezi citizen experience supervisor tarafından izlenir.
- Klavye modality'sinde odak halkası güçlendirilir; pointer kullanımında yalnız `:focus-visible` semantiği korunur.
- Tek tuşlu uygulama kısayolları Ctrl/⌘/Alt kombinasyonlarını, tekrar eden tuşları, IME composition'ı ve metin/combobox/dialog etkileşimlerini ele geçirmez. Böylece Ctrl/⌘+L, Ctrl/⌘+D ve Ctrl/⌘+F gibi tarayıcı kısayolları güvenli kalır.
- Shadow DOM içindeki ArcGIS arama girişleri `KeyboardEvent.composedPath()` üzerinden etkileşimli hedef olarak algılanır.
- ToolRail tek-seferlik eylemleri artık ekran okuyucuya toggle olarak bildirmez; yalnız gerçekten açık/kapalı durumu olan panel/harita araçları `aria-pressed` kullanır.
- Mobil ikincil paneller açıldığında kapatma düğmesi güvenilir odak hedefidir.
- Kayıtlı çalışma görünümü silmek iki aşamalıdır; tek yanlış dokunuş kalıcı silme yapmaz.
- Uzun metinler, panel overscroll davranışı, düşük yükseklikli mobil ekranlar, high-contrast ve reduced-transparency ortamları için ek korumalar vardır.

## Regresyon korumaları

`tests/globalShortcutGuard.test.ts` tarayıcı/app kısayol tahkimini saf TypeScript seviyesinde doğrular. `tests/citizenExperienceV47.test.ts` responsive grid, OS preference signal'ları, ToolRail semantiği, mobil panel focus hedefi ve yer imi silme onayını kilitler.

Paket major sürümü ve PWA cache generation birlikte `47` olarak döndürülür; `tests/releaseCoherence.test.ts` bu eşleşmeyi doğrulamaya devam eder.

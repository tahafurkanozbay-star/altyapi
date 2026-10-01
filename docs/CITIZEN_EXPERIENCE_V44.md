# Ankara Kent Rehberi v44 · Etkileşim Sağlamlaştırma

v44, v43'te kurulan vatandaş odaklı responsive kabuğu değiştirmeden mobil erişilebilirlik, viewport davranışı ve uzun katalog performansını güçlendirir. GIS servis/runtime zinciri v42-v43 davranışını korur.

## Neden TypeScript kalıyor?

Projenin first-party uygulama, worker, service worker, test ve bakım kodu zaten strict TypeScript 7'dir. React 19.3, Vite 8.3 ve ArcGIS Maps SDK 5.1 doğrudan JavaScript/TypeScript web platformunu hedeflediğinden native bir dile yeniden yazım ek köprü, bundle ve bakım riski oluşturur. v44 bu nedenle dili değiştirmek yerine mevcut tek-dil mimarisini daha sıkı ve daha modern tarayıcı yetenekleriyle kullanır.

## Mobil panel yaşam döngüsü

`citizenExperienceSupervisor` tek bir typed yaşam döngüsü altında aşağıdakileri yönetir:

- `760px` altındaki bottom-sheet kapalıyken panel `inert` ve `aria-hidden` olur; görünmeyen kontroller klavye tab sırasına girmez.
- panel araç düğmeleri `aria-controls` / `aria-expanded` ile gerçek panel görünürlüğüyle senkron tutulur.
- panel kapatılırsa odak, paneli açan araca geri döner.
- panel kullanıcı tarafından araç düğmesinden açılırsa mobil kapatma kontrolüne güvenli focus aktarılır.
- desktop/mobile ve coarse/fine pointer durumu tek yerde izlenir.

## Sanal klavye ve Visual Viewport

Mobil tarayıcının sanal klavyesi açıldığında klasik `100vh` / fixed-position düzenleri harita ve bottom-sheet ile çakışabilir. v44 `window.visualViewport` değerlerinden gerçek görünür yüksekliği ve klavye inset'ini üretir:

- `--v44-visual-height`
- `--v44-keyboard-inset`
- `data-virtual-keyboard="open|closed"`

Klavye açıkken alt araç dock'u geçici olarak geri çekilir ve açık bottom-sheet klavyenin üzerine taşınır. Kullanıcı metin girişi yaparken durum barı ve bildirim bantları ekran alanını daraltmaz.

## Daha anlaşılır mobil araç dock'u

v43'te mobil dock ikon merkezliydi. v44 her araç için kısa görünen metin etiketi ekler. Bu etiketler ekran okuyucu metninin yerine geçmez; `aria-label` korunur. Araç grupları gerçek `role="group"` semantiği kullanır.

## Uzun katalog ve düşük ağ koşulları

- Katman/katalog kartlarında destekleyen tarayıcılarda `content-visibility: auto` kullanılır; ekran dışındaki uzun listeler gereksiz paint/layout maliyeti üretmez.
- `contain-intrinsic-size` ile scroll yüksekliği kararlı kalır.
- `Save-Data`, 2G veya slow-2G durumunda dekoratif backdrop blur azaltılır.
- Sekme arka plana geçtiğinde loading spinner animasyonu duraklatılır.
- coarse pointer cihazlarda kritik dokunma hedefleri en az 48 px olur.

## Erişilebilirlik

v43'teki skip-link, focus-visible, reduced-motion ve high-contrast yapısına ek olarak v44:

- kapalı mobil içeriği tab sırasından çıkarır,
- focus geri dönüşünü deterministik yapar,
- Windows Forced Colors modunda seçili araç/katman/filter durumlarına sistem rengiyle görünür outline ekler,
- viewport değişimlerini ARIA içeriğini bozmadan yalnız görünürlük/odak katmanında ele alır.

## PWA

Uygulama sürümü `44.0.0`, PWA cache nesli `v44` olur. `src/sw/sw.ts` kaynak dosyası ve repository'deki derlenmiş `public/sw.js` aynı nesle döndürülür.

## Regresyon koruması

`tests/citizenExperienceV44.test.ts` şunları kilitler:

- supervisor'ın uygulama başlangıcında kurulması,
- `visualViewport`, `inert`, `aria-hidden`, focus geri dönüşü ve ağ tercihi izleme sözleşmeleri,
- mobil dock'un görünen metin etiketleri,
- `content-visibility`, container query, coarse-pointer ve forced-colors CSS guardrail'leri,
- package/PWA cache sürüm eşleşmesi.

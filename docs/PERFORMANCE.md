# Performans Tasarımı

## Otomatik profil

`src/lib/performance.ts` dört tarayıcı sinyalini değerlendirir: CPU thread sayısı, yaklaşık cihaz belleği, coarse pointer/mobil ekran ve reduced-motion tercihi.

- **high:** güçlü masaüstü; yüksek SceneView kalitesi, gölge ve ambient occlusion
- **balanced:** orta seviye/mobil; orta SceneView kalitesi ve sınırlı efekt
- **eco:** düşük bellek/CPU veya reduced-motion; düşük kalite, gölge kapalı, daha küçük layer cache

Kullanıcı üst çubuktan otomatik seçimi manuel olarak değiştirebilir.

## Ağ ve katman yükleme

- ArcGIS 5.1 CDN modülleri ihtiyaç anında dinamik import edilir.
- Katmanlar kullanıcı açana kadar oluşturulmaz.
- Başlangıç katmanları iki eşzamanlı yükleme ile sınırlandırılır.
- Kapalı katmanlar hızlı yeniden açma için kısa süre cache'de tutulur; profil sınırı aşılırsa en eski kapalı layer instance'ları temizlenir.
- WMS/WFS/ArcGIS servis yanıtları service worker tarafından cache'lenmez.

## UI

- Arama `useDeferredValue` kullanır.
- Katman grupları `content-visibility: auto` ve CSS containment kullanır.
- Harita pointer telemetry güncellemesi `requestAnimationFrame` ile throttle edilir.
- Kamera persist işlemi debounce edilir.
- `prefers-reduced-motion` animasyonları otomatik azaltır.

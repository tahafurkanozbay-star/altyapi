# Ankara Kent Rehberi v43 · Vatandaş Deneyimi

v43, v42'deki servis/katman dayanıklılığı ve atomik aktivasyon çekirdeğini değiştirmeden uygulamanın bütün kullanıcı kabuğunu vatandaş odaklı, erişilebilir ve mobil kullanılabilir hale getirir.

## Temel ilkeler

- **Tek first-party dil:** uygulama, worker, service worker, testler ve bakım araçlarının kaynak kodu strict TypeScript'tir. ArcGIS tarayıcı SDK'sına native dil köprüsü eklenmez; bu hem bundle hem bakım karmaşıklığını artırır.
- **Vatandaş dili:** katman panelinde operasyon/altyapı mühendisliği jargonunun yerine açık, eylem odaklı Türkçe kullanılır.
- **Dokunmatik öncelik:** etkileşimli kontroller en az 44 px hedef alanına sahip olur; küçük ekranlarda araç rayı alt dock'a, çalışma paneli bottom-sheet düzenine dönüşür.
- **Klavye ve ekran okuyucu:** skip-link, landmark, dinamik ARIA etiketleri, görünür focus ring, `/` arama ve `?` yardım kısayolları bulunur.
- **Hareket hassasiyeti:** `prefers-reduced-motion` tercihinde geçişler/animasyonlar bastırılır. `prefers-contrast: more` tercihinde sınırlar ve yardımcı metin kontrastı yükseltilir.
- **Progressive loading:** ağır Harita Verisi çalışma alanı yalnız kullanıcı açtığında `React.lazy` + `Suspense` ile indirilir.
- **Gerçek bağlantı durumu:** çevrimdışı durumda tek seferlik toast dışında kalıcı fakat engellemeyen bir durum bandı gösterilir.
- **Tek marka:** HTML metadata, PWA manifest, favicon/touch icon ve görünür uygulama markası `Ankara Kent Rehberi` ve sağlanan Ankara logosuyla uyumludur.

## Masaüstü düzeni

Masaüstünde mevcut 3B çalışma alanı korunur. Üst çubuk arama, harita görünümü ve paylaşım işlemlerini; sol araç rayı katmanlar, veri, yer imleri ve 3B analiz araçlarını taşır. Katman paneli servis durumunu teknik olmayan ifadelerle açıklar; ayrıntı açıldığında ileri seviye metadata yine erişilebilir durumdadır.

## Mobil düzen

`760px` ve altında:

1. üst çubuk sadeleşir,
2. adres araması ayrı ve tam genişlikli erişilebilir alana taşınır,
3. araç rayı safe-area uyumlu yatay alt dock olur,
4. Katmanlar / Harita Verisi / Yer İmleri / Yardım panelleri dock üstünde bottom-sheet olarak açılır,
5. harita üzerindeki yardımcı paneller ve durum çubuğu dock ile çakışmayacak şekilde yeniden konumlanır.

Bu düzen, haritanın küçük ekranda da ana çalışma alanı olarak kalmasını sağlar.

## Katman paneli

Katman paneli aşağıdaki kullanıcı akışını hedefler:

- katman veya kurum ara,
- tür ve bağlantı durumuna göre filtrele,
- yalnız açık veya favori katmanları göster,
- tüm filtreleri tek eylemle temizle,
- katmanı aç/kapat,
- saydamlığı ayarla,
- veri kapsamına git,
- gerekiyorsa yeniden dene,
- ayrıntı panelinden ölçek, kapsam ve bağlantı bilgisini incele.

v18-v42 arasında geliştirilen provider zoom, LayerView render health, extent reconciliation, circuit-breaker ve failover mekanizmaları aynen korunur; v43 yalnız bunların kullanıcıya sunuluşunu sadeleştirir.

## Başlangıç ve PWA

Eski inline boot JavaScript'i `src/boot.ts` dosyasına taşınmıştır. Böylece first-party kaynak kodunda ayrı bir JavaScript adası kalmaz. CSS/React yüklenemediğinde bile bu TypeScript bootstrap okunabilir bir hata kartı üretir.

PWA cache nesli `v43` olur ve shell cache Ankara logosunu içerir. `services.json`, `service-health.json` ve `service-navigation.json` önceki sürümlerde olduğu gibi network-first / `no-store` mantığında kalır; canlı servis bilgisinin eski cache tarafından gölgelenmesi engellenir.

## Regresyon koruması

`tests/citizenExperienceV43.test.ts` aşağıdaki sözleşmeleri kilitler:

- `src/` ve `scripts/` altında legacy `.js/.mjs/.jsx` first-party kaynak bulunmaması,
- Ankara Kent Rehberi metadata ve PWA markası,
- erişilebilir landmark ve klavye kısayolları,
- vatandaş dilindeki katman yönetimi,
- DataWorkbench lazy-loading,
- reduced-motion / high-contrast / 44 px touch-target CSS guardrail'leri,
- package major sürümüyle birlikte döndürülen v43 service-worker cache nesli.

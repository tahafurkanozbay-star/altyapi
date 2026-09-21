# Adaptive Operations

Başkent 3B CBS v12, servis sağlığı ve runtime reliability sinyallerini yalnız raporlamak yerine güvenli çalışma alanı aksiyonlarına dönüştürür.

## Adaptif Güvenli Mod

`buildStabilizationPlan()` mevcut servis durumunu inceler ve iki ayrı aksiyon listesi üretir:

- **hideIds:** görünür olduğu halde doğrulama durumu riskli, runtime hatalı veya circuit-breaker beklemesinde olan servisler
- **activateIds:** sahnede stabil bir servis kalmadığında devreye alınabilecek doğrulanmış servisler

Aktivasyon üst sınırı varsayılan olarak 2'dir. Seçim sırası:

1. favori servisler
2. SceneServer
3. FeatureServer
4. MapServer
5. WMS / WFS
6. aynı öncelikte hazırlık skoru ve ad sırası

Bu davranış, çok sayıda ağır katmanın aynı anda yüklenmesini engeller.

## Oturum güvenilirlik analitiği

`sessionReliability.ts` incident journal kayıtlarını zaman pencerelerine göre analiz eder.

Hesaplanan sinyaller:

- toplam olay
- hata
- uyarı
- toparlanma
- toparlanma oranı
- ortalama olay süresi
- P95 olay süresi
- olay türü dağılımı
- önceki pencereye göre trend
- 0–100 istemci güvenilirlik skoru

Bu skor resmi SLA değildir; istemci oturumunun teknik kararlılığını özetleyen açıklanabilir bir heuristiktir.

## Kontrollü PWA güncellemesi

v12'de service worker yeni sürüm bulunduğunda otomatik olarak aktif worker'ı ezmez.

Akış:

1. yeni worker install olur ve waiting durumuna geçer
2. uygulama `altyapi:update-available` olayıyla kullanıcıya bildirim gösterir
3. kullanıcı **Güncelle** dediğinde `SKIP_WAITING` mesajı gönderilir
4. `controllerchange` sonrası sayfa yalnızca bir kez yenilenir

Bu yaklaşım, kullanıcı aktif bir harita çalışması yaparken uygulamanın beklenmedik anda yeniden yüklenmesini azaltır.

## Offline veri stratejisi

- `altyapi-shell-v12`: uygulama shell dosyaları
- `altyapi-data-v12`: `services.json` ve `service-health.json`

Katalog ve health snapshot network-first çalışır. Ağ isteği başarısızsa son başarılı same-origin kopya kullanılabilir. Harici ArcGIS / OGC servis içerikleri service worker tarafından cache'lenmez.

## Güvenlik

Incident ve health verileri URL/token tekrar etmeden tutulur. Adaptif plan yalnız mevcut sanitize edilmiş runtime state ve katalog kimliklerini kullanır.

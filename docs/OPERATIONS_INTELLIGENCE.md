# Operations Intelligence

Başkent 3B CBS v10, servis sağlığını yalnız renkli bir durum etiketi olarak göstermek yerine operasyon önceliklendirmesine dönüştürür.

## Hazırlık endeksi

Her servis için 0–100 arasında deterministik bir hazırlık puanı hesaplanır. Bu puan resmi bir SLA veya kurum performans notu değildir. Yalnızca istemci tarafında hangi servisin önce incelenmesi gerektiğini göstermek için tasarlanmış açıklanabilir bir heuristiktir.

Puan şu sinyalleri kullanır:

- harici doğrulama: verified / degraded / unavailable / unknown
- tarayıcı erişimi: public-browser / browser-blocked / network-restricted / server-error
- canlı runtime: ready / loading / error / idle
- görünürlük
- canlı katman açılış gecikmesi
- sanitizasyonlu harici probe gecikmesi
- ardışık hata sayısı
- aktif circuit-breaker cooldown
- health snapshot freshness

## Teknik sınıflar

- **85–100 · Çok iyi:** doğrulanmış, tarayıcıdan erişilebilir ve canlı sinyalleri sağlıklı servisler
- **65–84 · İyi:** kullanılabilir ancak bazı sinyalleri eksik veya daha yavaş servisler
- **40–64 · Dikkat:** erişim, freshness veya hata geçmişi nedeniyle kontrol edilmesi gereken servisler
- **0–39 · Kritik:** dış doğrulamada ulaşılamayan, runtime hatası veren veya devre kesicideki servisler

Bu eşikler kullanıcı tercihi veya politik değerlendirme içermez; yalnız teknik operasyon sinyallerinin sunumudur.

## Operasyon Özeti

Varsayılan panel şu bilgileri tek görünümde toplar:

- toplam hazırlık endeksi
- doğrulanmış ve riskli servis sayısı
- aktif / hazır servis sayısı
- runtime hata ve circuit-breaker sayısı
- en düşük hazırlığa sahip servisler
- en yüksek hazırlığa sahip servisler
- sistem tarafından üretilen açıklanabilir aksiyon önerileri

## Health snapshot

`public/service-health.json` endpoint veya token içermez. Production Pages workflow'u deploy öncesinde ve günlük schedule ile `npm run probe:services` çalıştırarak yayınlanan snapshot'ı tazeler.

v10 ile probe sonucu ayrıca `latencyMs` taşıyabilir. Bu değer yalnız isteğin geçen süresidir; URL, token veya response body health snapshot'a yazılmaz.

## Offline davranış

Service worker iki ayrı cache kullanır:

- `altyapi-shell-v10`: HTML, JS, CSS ve görsel shell
- `altyapi-data-v10`: `services.json` ve `service-health.json`

Katalog ve health snapshot için network-first uygulanır. Ağ başarısızsa son başarılı same-origin kopya kullanılabilir. Dış ArcGIS/OGC servisleri cache'lenmez.

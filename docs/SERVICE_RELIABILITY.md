# Service Reliability Architecture

Başkent 3B CBS v9, dış servislerin her zaman aynı ağ koşullarında veya aynı sağlık durumunda olmayacağını varsayar. Amaç tek bir bozuk servisin uygulamanın başlangıcını, katman kataloğunu veya 3B sahneyi kilitlemesini önlemektir.

## İki katmanlı sağlık modeli

Uygulama iki ayrı sinyali birlikte kullanır:

1. **Harici doğrulama snapshot'ı** — `public/service-health.json`.
2. **Canlı tarayıcı telemetrisi** — kullanıcının o oturumunda ArcGIS layer yükleme sonucu.

Snapshot, endpoint URL'si veya erişim tokenı içermez. Yalnız servis sırası, katman adı, tür, erişim sınıfı, tarayıcı uyumu ve sanitizasyonlu açıklama taşır.

## Availability durumları

- `verified`: doğrulama noktasından veri/metadata yanıtı ve tarayıcı erişimi doğrulandı.
- `degraded`: servis tamamen doğrulanamadı; ağ/kurum erişimi veya CORS kısıtı olabilir.
- `unavailable`: doğrulama sırasında belirgin sunucu/protokol hatası alındı.
- `unknown`: güvenilir doğrulama verisi yok.

Snapshot 72 saatten eskiyse otomatik yükleme politikası bu sonucu kesin engel olarak kullanmaz. Böylece eski bir ölçüm, sonradan düzelmiş servisi süresiz kapalı tutmaz.

## Devre kesici

Canlı tarayıcı oturumunda art arda hata alan katmanlar için hata sayacı tutulur. İkinci hatadan itibaren üstel geri çekilme uygulanır ve bekleme süresi en fazla 15 dakikaya çıkar.

- ilk hata: cooldown yok
- ikinci hata: kısa cooldown
- sonraki hatalar: artan cooldown
- başarılı yükleme: sayaç ve cooldown sıfırlanır

Toplu retry, `unavailable` olarak doğrulanmış veya cooldown içinde olan servisleri atlar. Kullanıcı tekil katmanda manuel retry yaparak bilinçli olarak tekrar deneyebilir.

## Otomatik başlangıç

Tercihler veya paylaşım bağlantısı bir katmanı açık istese bile, taze snapshot içinde `degraded` veya `unavailable` olan servisler başlangıçta otomatik zorlanmaz. Kullanıcı Katmanlar panelinden manuel deneme yapabilir.

Bu yaklaşım:

- beyaz ekran / uzun başlangıç beklemelerini azaltır,
- dış servis arızasını uygulama arızasından ayırır,
- gereksiz tekrar isteklerini sınırlar,
- harita deneyimini doğrulanmış servislerle hızlı başlatır.

## Manuel doğrulama

```bash
npm run probe:services
npm run validate:health
```

Probe tarayıcı origin'ini taklit eden `Origin` başlığıyla servisleri ölçer ve sonucu `public/service-health.json` dosyasına yazar. Log ve snapshot endpoint URL'lerini yazdırmaz.

## GitHub Actions

`.github/workflows/service-health.yml` günlük ve manuel çalıştırılabilir. Workflow snapshot'ı repoya otomatik commit etmez; sanitizasyonlu sonucu artifact olarak saklar. Böylece ağdaki geçici bir sorun üretim kodunu kendiliğinden değiştirmez.

Üretimde kullanılacak snapshot değişikliği normal PR/CI sürecinden geçirilmelidir.

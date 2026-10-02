# Service Health v46

v46, Ankara Kent Rehberi'nde servis erişim kararını **public CI runner sonucu** ile **gerçek vatandaş tarayıcısında kanıtlanmış render sonucu** arasında daha doğru bir otorite sırasına taşır.

## Neden gerekli?

GitHub Actions gibi public runner'lar ABB/TUCBS ağ yollarını kullanıcının gerçek ağıyla aynı şekilde göremez. Özellikle IP/ağ-kısıtlı bir servis runner'da `degraded` görünürken kullanıcının tarayıcısında tamamen çalışabilir. Eski bir runner snapshot'ını scheduler girdisi olarak taşımak, çalışan bir katmana gereksiz sağlık cezası verebilir.

## Otorite sırası

1. **TUCBS approved-IP profili** yalnız TUCBS için son otoritedir.
2. Son 12 saat içinde aynı tarayıcıda `LayerView stable` olmuş public katman, gerçek tarayıcı erişim kanıtı sayılır.
3. Taze public-runner snapshot'ı diğer servislerde başlangıç sinyalidir.
4. 72 saatten eski public-runner snapshot'ı yalnız provenance olarak korunur; `verified/degraded/unavailable` kararı scheduler'a taşınmaz.
5. Hiç taze kanıt yoksa katalog `unknown` durumundan gerçek browser yüklemesini dener.

## Güvenlik ve gizlilik

`browserServiceHealth` deposu yalnız şunları tutar:

- public katalogdaki anonim `serviceId`,
- ISO doğrulama zamanı,
- varsa ilk stabil render süresi.

Aşağıdakiler **saklanmaz**:

- endpoint URL'si veya host,
- query string,
- TUCBS signed URL/token,
- API anahtarı veya authorization bilgisi,
- servis yanıt gövdesi,
- kullanıcının IP adresi.

TUCBS katmanlarında generic browser-health overlay devre dışıdır; mevcut `tucbsClientHealth` approved-IP semantiği korunur.

## Yaşam döngüsü

`layer-render-health: stable` olayı geldiğinde profil güncellenir. Depo en fazla 64 servis kaydı tutar ve 12 saatten eski kayıtları yükleme sırasında otomatik temizler. Storage erişimi private mode/quota nedeniyle başarısız olursa harita normal biçimde çalışmaya devam eder.

## Scheduler etkisi

Taze browser kanıtı bulunan public servis `verified/public-browser` olarak başlar. Bu, public runner'ın ağ-kısıtlı/degraded sinyalinin aynı tarayıcıda tekrar tekrar restore sırasını düşürmesini engeller. Buna rağmen gerçek runtime retry, provider-local circuit breaker, cooldown ve LayerView watchdog davranışları değişmez; eski bir başarı kanıtı aktif runtime hatasını maskelemez.

## PWA nesli

Uygulama sürümü `46.0.0`, shell/data cache nesli `v46` olarak birlikte döndürülür.

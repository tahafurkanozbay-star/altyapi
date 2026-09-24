# Güvenli Servis Entegrasyonu

Public GitHub deposunda URL içinde credential/token taşıyan WMS/WFS uçları saklanmaz. TUCBS/UCBP servisleri IP kısıtlı olduğunda iki ayrı erişim modeli desteklenir.

## 1. Onaylı istemci IP'sinden doğrudan erişim

TUCBS proje erişimi kullanıcının dış/statik IP'sine tanımlıysa tarayıcı WMS/WFS isteğini doğrudan `ucbp-api.tucbs.gov.tr` adresine gönderebilir. Kent Rehberi public katalogda gerçek imzalı servis URL'sini saklamaz; bunun yerine güvenli bir runtime anahtarı tutar.

Kullanıcı ilk TUCBS katmanını açtığında kendi yetkili TUCBS servis JSON dosyasını tarayıcıya tanımlar. Gerçek servis adresleri yalnız `sessionStorage` veya kullanıcı açıkça "Bu cihazda hatırla" seçerse `localStorage` içinde tutulur. Bu bilgiler uygulama tarafından GitHub'a, GitHub Actions'a veya başka bir sunucuya gönderilmez.

```text
Yetkili tarayıcı / onaylı dış IP
  │ HTTPS WMS/WFS
  ▼
ucbp-api.tucbs.gov.tr
```

GitHub Actions runner'ının farklı bir dış IP'den TUCBS servisine erişememesi, onaylı kullanıcı IP'sindeki servisin kapalı olduğu anlamına gelmez. Bu nedenle CI sağlık kontrolü IP-kısıtlı TUCBS katmanlarını `network-restricted / unknown` olarak işaretler ve kullanıcının istemci erişimini engellemez.

## 2. Halkın farklı IP'lerden erişeceği yayın

TUCBS katmanının herkes tarafından, TUCBS'ye tanımlı olmayan farklı internet IP'lerinden de açılması gerekiyorsa sabit/onaylı çıkış IP'sine sahip kurumsal bir API Gateway / Proxy gerekir. `public/services.private.example.json` bu ikinci model için yalnızca proxy URL şablonudur.

```text
Browser
  │ HTTPS /geoservices/wms/...
  ▼
Kurumsal API Gateway / Proxy (onaylı sabit çıkış IP'si)
  ├─ kullanıcı oturumu / yetki
  ├─ rate limit
  ├─ audit log
  ├─ izinli WMS/WFS operasyonları
  └─ servis credential'ı
  │
  ▼
TUCBS / UCBP CBS servisi
```

Proxy mümkünse `GetCapabilities`, harita image/tile ve salt-okunur feature sorgularını ayrı politikalarla ele almalı; yazma operasyonlarını varsayılan olarak reddetmelidir. Gerçek imzalı TUCBS URL'leri hiçbir zaman public repository, build artifact'i, log veya sağlık snapshot'ına yazılmamalıdır.

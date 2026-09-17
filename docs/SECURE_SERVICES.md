# Güvenli Servis Entegrasyonu

Public GitHub deposunda URL içinde credential/token taşıyan WMS/WFS uçları saklanmaz. `public/services.private.example.json` yalnızca proxy URL şablonudur.

Önerilen üretim topolojisi:

```text
Browser
  │ HTTPS /geoservices/wms/...
  ▼
Kurumsal API Gateway / Proxy
  ├─ kullanıcı oturumu / yetki
  ├─ rate limit
  ├─ audit log
  ├─ izinli WMS/WFS operasyonları
  └─ kısa ömürlü servis credential'ı
  │
  ▼
UCBP / Kurum CBS servisi
```

Proxy mümkünse `GetCapabilities`, harita tile/image ve salt-okunur feature sorgularını ayrı politikalarla ele almalı; yazma operasyonlarını varsayılan olarak reddetmelidir.

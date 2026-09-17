# Performance Budget

Hedefler:

- Uygulama kabuğu ilk etkileşimde harita kontrollerini bloklamamalı.
- ArcGIS analiz araçları ihtiyaç halinde dinamik yüklenmeli.
- Düşük donanımda kalite profili otomatik düşürülebilmeli.
- Panel filtreleme ve durum güncellemeleri harita render döngüsünden ayrılmalı.
- Servis yükleme hatası diğer servisleri engellememeli.
- Statik varlıklar service worker/CDN üzerinden güvenli şekilde cache edilebilmeli.

Gerçek üretim metrikleri için RUM/telemetri entegrasyonu ayrıca eklenebilir.

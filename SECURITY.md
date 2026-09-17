# Security Policy

## Gizli bilgi politikası

Bu depo public'tir. Tarayıcıya gönderilen her URL, header ve token son kullanıcı tarafından görülebilir. Bu nedenle uzun ömürlü erişim anahtarı, kişisel API anahtarı, yönetici tokenı veya kurum içi kimlik bilgisi repoya eklenmemelidir.

## WMS/WFS ve tokenlı servisler

Kimlik doğrulama gerektiren CBS uçları için:

1. Tarayıcı yalnızca uygulama origin'indeki `/geoservices/*` proxy uçlarını çağırır.
2. Proxy gerçek hedef URL/tokenı sunucu tarafında saklar.
3. Proxy yetkilendirme, oran sınırlama, audit log, CORS ve izinli OGC operasyonlarını uygular.
4. Tokenlar kısa ömürlü ve en az yetkili olmalıdır.
5. Şüpheli sızıntıda token hemen iptal/rotate edilir; Git geçmişi de temizlenir.

## İstemci güvenliği

- `services.json` yalnızca HTTPS URL kabul eder.
- Service worker harici CBS servislerini cache'lemez.
- Kullanıcı öznitelikleri React text rendering ile gösterilir; HTML olarak enjekte edilmez.
- URL paylaşım durumu sayısal koordinat aralığı doğrulamasından geçer.

Güvenlik açığını public issue yerine depo sahibine özel kanaldan bildirin.

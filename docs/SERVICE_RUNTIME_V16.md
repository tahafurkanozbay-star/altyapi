# Service Runtime v16

## Amaç

Kent Rehberi'nin 20 servisinin ağ gecikmesi, geçici sunucu hatası, IP kısıtı veya OGC metadata farklılıkları nedeniyle gereksiz biçimde başarısız görünmesini azaltmak; başarısızlık halinde de harita durumunu temiz ve deterministik tutmak.

## Katman bazlı politika

`src/lib/serviceRuntime.ts`, servis türüne göre oluşturma süresi, yükleme süresi, maksimum deneme sayısı ve backoff değerlerini belirler. Sağlık snapshot'ında ölçülmüş gecikme varsa timeout bütçesi buna göre büyütülür ve 60 saniyelik üst sınır korunur.

| Tür | Temel yükleme timeout | Deneme |
| --- | ---: | ---: |
| WMS | 35 sn | 3 |
| WFS | 40 sn | 3 |
| MapServer | 30 sn | 3 |
| FeatureServer | 25 sn | 2 |
| SceneServer | 35 sn | 2 |

Yetkili doğrudan TUCBS WMS/WFS bağlantılarında yükleme bütçesi en az 45 saniyedir. Art arda çok hata alan bir servis için retry sayısı düşürülerek servis gereksiz yere dövülmez.

## Hata sınıflandırması

Runtime hataları şu sınıflara ayrılır:

- `configuration`: yanlış/eksik endpoint veya desteklenmeyen yapı
- `authorization`: 401/403 ve erişim reddi
- `network`: fetch/CORS/DNS/connection problemleri
- `timeout`: süre aşımı/abort
- `server`: 5xx geçici sunucu hataları
- `format`: beklenmeyen OGC/JSON/XML yanıtı
- `unknown`: diğer hatalar

Yalnız ağ, timeout, 5xx ve bilinmeyen geçici hatalar otomatik yeniden denenir. Authorization, configuration ve format hatalarında tekrar yapılmaz.

## Fresh-instance retry

ArcGIS `Layer.load()` tek yükleme yaşam döngüsüne sahip olduğundan, başarısız layer nesnesini tekrar yüklemek yerine her denemede yeni layer örneği oluşturulur. Timeout olursa `cancelLoad()` çağrılır ve başarısız aday temizlenir.

Katman yalnız `load()` tamamlandıktan sonra `map.add()` ile canlı haritaya eklenir. Böylece başarısız/yarım katman harita modeline sızmaz.

## WMS alt katman seçimi

Bir WMS endpoint'i çok sayıda named layer yayınlıyorsa `finalizeLoadedLayer()` katalogdaki katman adını WMS title/name alanlarıyla Türkçe karakterlerden bağımsız normalize ederek eşleştirir. Yalnız yüksek güven skoru varsa tek alt katman seçilir; belirsiz eşleşmede sağlayıcının doğal davranışına dokunulmaz.

## TUCBS ve onaylı IP

Public katalog gerçek imzalı TUCBS endpoint'ini içermez. Kullanıcı yetkili servis JSON'unu tarayıcıya tanımlar. `verifyTucbsEndpoints()` her endpoint için tarayıcıdan WMS/WFS `GetCapabilities` çağrısı yapar. Böylece doğrulama GitHub runner IP'sinden değil gerçek onaylı istemci IP'sinden gerçekleşir.

Doğrulama raporu URL içermez; yalnız endpoint anahtarı, başarı durumu ve gecikme gibi sanitized sonuçlar üretir.

CI tarafında runtime TUCBS sentinel kayıtları:

- health probe'da `unknown / network-restricted`
- scale audit'te `client-ip-required`

olarak değerlendirilir. Public runner erişemedi diye TUCBS katmanı kapalı kabul edilmez.

## TypeScript standardizasyonu

v16 ile `scripts/*.mjs` araçları `.ts` uzantısına taşınmıştır ve `tsx` ile çalışır. Uygulama, testler ve bakım/audit araçları aynı TypeScript ekosisteminde tutulur.

## Regresyon koruması

`npm run check` aşağıdaki zinciri çalıştırır:

1. servis katalog güvenlik/şema kontrolü
2. health snapshot doğrulaması
3. navigation snapshot doğrulaması
4. strict TypeScript typecheck
5. Vitest
6. production Vite build
7. build artifact doğrulaması

CI Node 22 ve Node 24 matrisinde çalışır; ayrıca CodeQL zorunlu güvenlik kontrolüdür.

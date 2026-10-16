# Güvenlik Politikası

## Gizli bilgi ve kamuya açık istemci

Bu depo ve GitHub Pages uygulaması kamuya açıktır. Tarayıcıya gönderilen URL, sorgu parametresi ve erişim belirteçleri tarayıcının ağ araçları tarafından görülebilir; **tarayıcı depolaması bir sunucu tarafı sır kasası değildir**. Uzun ömürlü API anahtarları, yönetici tokenları, kurum içi kimlik bilgileri ve gerçek imzalı TUCBS servis URL'leri depoya, issue/PR açıklamalarına, CI loglarına veya yayınlanan statik dosyalara eklenmemelidir.

Uygulama güvenli varsayılanlar kullanır; ancak kaynak IP yetkilendirmesinin ve servis tokenlarının yönetimi ilgili servis sağlayıcısının sorumluluğundadır.

## Güncel TUCBS WMS/WFS bağlantı modeli

1. Kamuya açık `public/services.json` içinde gerçek yetkili TUCBS adresleri yerine `/__runtime__/` işaretleyicileri bulunur.
2. Kullanıcı, yalnız yetkili ortamda, TUCBS servis JSON'unu tarayıcıdaki erişim penceresine yükler veya yapıştırır. Uygulama yalnız HTTPS `ucbp-api.tucbs.gov.tr/geoservice/spatial/` adreslerini kabul eder.
3. Tarayıcı, gerçek servis adresine **doğrudan** WMS/WFS GetCapabilities isteği gönderir. Erişim onaylı dış IP, servis yetkisi ve tarayıcı ağ/CORS koşullarına bağlıdır. GitHub Actions çalıştırıcısından erişilememesi, yetkili ağda da erişilemeyeceği anlamına gelmez.
4. Başarılı doğrulama sonrası adresler `sessionStorage` içinde tutulur. Kullanıcı **Bu cihazda hatırla** seçerse `localStorage` içine de kaydedilir. Paylaşılan cihazlarda kalıcı saklama seçeneğini kullanmayın; gerektiğinde site verilerini temizleyin.
5. Başarısız veya geçersiz adresler aktif çalışma ortamına kaydedilmez; gözlem/sağlık kayıtlarına imzalı URL veya token yazılmaz.

Bu sürümde `/geoservices/*` sunucu tarafı proxy **bulunmamaktadır**. Özel servis URL'lerini son kullanıcının tarayıcısından tamamen gizlemek istenirse, yetkilendirme, hız sınırlaması, kayıt temizliği ve sır yönetimi yapan ayrı bir sunucu tarafı proxy mimarisi gerekir.

## İstemci ve günlük güvenliği

- Servis kataloğu HTTPS ve izinli servis şemalarını doğrular.
- Service worker harici CBS yanıtlarını önbelleğe almaz.
- Kullanıcı/servis kaynaklı öznitelikler React metin düğümleri olarak gösterilir; HTML olarak enjekte edilmez.
- Paylaşım bağlantılarındaki koordinat ve katman parametreleri doğrulanır.
- Arayüz, olay günlüğü ve tarayıcıya ait uygulama konsol kayıtları ham sağlayıcı hata nesnelerini veya imzalı URL'leri yayımlamamalıdır.
- Yetki hataları otomatik tekrar denemeyle veya başka uç noktalar üzerinden atlatılmaya çalışılmaz.

## Sızıntı ve sorumlu bildirim

Bir gerçek token, yetkili URL veya diğer kimlik bilgisi sızdıysa sağlayıcı tarafında derhal iptal/rotasyon yapın; kopyalandığı CI artifact'leri, logları, sürümleri ve Git geçmişini de değerlendirin. Güvenlik açıklarını kamuya açık issue yerine depo sahibiyle özel kanaldan paylaşın.

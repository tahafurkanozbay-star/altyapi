# v57: Kullanılabilir çalışma alanı

Harita araması üst menüde; etiketli araçlar solda; katmanlar tek çalışma panelinde;
ölçüm ve nesne ayrıntıları sağda sunulur. Mobilde harita ilk açılışta kullanılabilir,
katman paneli gerektiğinde açılır. Boş panelin gölgesi etkileşimleri engellemez.

Katman listesi kısa durum bilgisi gösterir. Çizim sırası ve tür/bağlantı filtreleri
native `details` ile açılır; erişim bilgisi olmayan TUCBS grubu başlangıçta kapalıdır.
Arama bu grubu otomatik açar. Bütün katmanlar katalogda ve filtrelerde korunur.
Panel kapatma, opacity değeri, yükleme iptali, yer imi ve yetkili servis penceresi
klavye ile kullanılabilir. Yetkili erişim native modal dialog kullanır.

## Yükleme ve doğruluk

- v56 provider topology çalışması dahil: Portal proxy ve direct REST aynı hostta
  ayrı circuit lane kullanır. Proxy yükleri seri, diğer sağlayıcılar cihaz/ağ
  bütçesine göre sınırlı eşzamanlı çalışır.
- Yeni oturumda ağır SceneServer otomatik açılmaz. Sınırlar varsa açılır; kayıtlı
  veya paylaşılan açık/boş görünüm aynen korunur.
- Yüklenen katman kapatılabilir. UI intent generation ve runtime visibility
  generation eski restore/retry yanıtlarının son seçimi değiştirmesini engeller.
- Toplu retry scheduler üzerinden eşzamanlı yürür. Araç kapandıktan sonra dönen
  asenkron component dispose edilir.
- Açılışta Search ve Navigation bağımsız yüklenir. Web Mercator açıkça tanımlıdır;
  altlık yanıt vermediğinde harita readiness sonsuza kadar koordinat sistemi
  beklemez. Scene hazırlığı 30 saniye sonunda anlaşılır hata verir.
- SDK worker/WASM/dil/ikon dosyaları `prepare:assets` ile kilitli npm paketlerinden
  üretilir. App, build ve GitHub Pages aynı yerel kaynak yollarını kullanır.
  Bunlar generated third-party assets; Git'e eklenmez.
- npm lockfile ve CI `npm ci` ile tekrar üretilebilir kurulum. Bakım araçları
  `node --import tsx` ile ek IPC socket gerektirmeden çalışır.

## Doğrulama

`npm run check`: servis şeması, source dili, metadata snapshot'ları, strict
TypeScript, Vitest, üretim build ve SDK asset varlığı.

`npm run test:e2e`: Chromium masaüstü/telefon/tablet senaryoları; arama, filtre
sıfırlama, panel kapatma/açma, bekleyen yüklemeyi iptal, native yer imi/erişim
pencereleri, veri paneli, sekiz araç ve axe WCAG erişilebilirlik taraması.
UI testlerinin GIS transport sınırı deterministik fixture ile izole edilmiştir;
fixture üretim koduna dahil değildir. Bu testler canlı GIS verisinin çizildiğini
iddia etmez. CI ayrıca 10 public sağlayıcı için gerçek sağlık/ölçek probe üretir.
TUCBS'nin 10 servisi kullanıcı yetkili endpoint'i ve onaylı IP gerektirir; public
runner bunların erişimini doğrulayamaz. Sağlık başarılı olsa da WebGL render ve
kurumsal ağ politikası son kullanıcının tarayıcısından ayrıca gözlemlenir.

Yerel SDK deployment yaklaşımı:
https://developers.arcgis.com/javascript/latest/working-with-assets/

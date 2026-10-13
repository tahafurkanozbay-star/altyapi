# Comfort White Design System

Başkent 3B CBS v7 için görsel sistemin amacı harita üzerinde uzun süre çalışan kullanıcıların gözünü yormadan yüksek bilgi yoğunluğunu korumaktır.

## Renk

Ana tuval `#f4f7f9`, panel yüzeyleri `#ffffff`, ana metin `#183243`, ikincil metin `#647d8e`, vurgu rengi `#1677d2` kullanır. Koyu arka plan veya yüksek parlaklıkta neon vurgu ana tasarım dili değildir.

## Yüzey

Panel, üst bar, araç rayı ve durum dock'u solid beyaza çok yakın tutulur. Blur ve transparan cam efekti yalnız harita ile yüzey arasındaki ayrımı destekleyecek kadar kullanılır. Gölge alfa değerleri düşük tutulur.

## Tipografi

Başlıklar ve katman adları eski sürümlere göre büyütülmüştür. Yardımcı mikro metinler kritik bilgi taşıdığı yerlerde 9–11 px aralığına yükseltilmiştir. Sistem font stack kullanılır; harici font CDN bağımlılığı yoktur.

## Etkileşim

- aktif öğe: açık mavi zemin + ince mavi sınır
- hover: çok hafif gri/mavi yüzey
- focus-visible: 2 px mavi halka
- hata: soluk kırmızı zemin
- başarı: koyu yeşil metin, açık yeşil yüzey
- animasyonlar 180–220 ms aralığında

## Erişilebilirlik

- `prefers-reduced-motion` desteklenir
- `prefers-contrast: more` durumunda sınırlar güçlendirilir ve gölgeler azaltılır
- yalnız renge dayalı durum işaretlerinden kaçınılır
- klavye ile komut paleti ve ana panellere erişim korunur
- mobil yüzeylerde transparanlık azaltılır

## Harita odak modu

Üst bardaki göz simgesi veya Yardım bölümünde gösterilen modifier kısayolu çalışma panelini, detay çekmecesini ve durum çubuğunu geri çeker. Escape ile odak modundan çıkılır ve mevcut panel korunur. Bir panel seçmek de odak modundan çıkar.

## Güncel çalışma alanı

- `citizen-shell.css` güncel yerleşim, tipografi ve etkileşim ölçülerinin tek sahibidir. Yeni sürüm için ek bir CSS düzeltme dosyası oluşturulmaz.
- Üst menünün gerçek yüksekliği `ResizeObserver` ile ölçülür. Paneller, araçlar ve harita gezinme kontrolleri bu yüksekliği kullanır.
- Katman başlığı, sayaçları ve araması sabittir; filtreler, katman listesi ve ayrıntılar kendi bölgesinde kaydırılır. Panel kapatma düğmesi her zaman ulaşılabilir kalır.
- Masaüstünde katman ve harita araçları iki ayrı bölgede açılabilir. 1100 px ve altında araç/panel seçimleri tek çalışma yüzeyini gösterir; ekran daraldığında açık araç korunur.
- Telefon paneli, üst menü ile alt araç çubuğu arasına sığar. Yatay ve kısa ekranlarda başlık özeti küçülür; içerik kaydırılarak erişilir. Açık mobil panelin arka planı inert ve klavye odağı sınırlandırılmıştır.
- Ana simge düğmeleri en az 44×44 CSS px olur. Katman adı ve durum metni satır kırabilir; opaklık yüzdesi tek satırda kalır.
- Veri paneli masaüstünde daha geniştir. Sonuç tablosu bağımsız yatay kaydırma ve klavye odağı sunar. Sorgu ayrıntıları isteğe bağlı açılır; boş sonuç aralığı 0–0 olarak gösterilir.
- Veri panelindeki filtre ve sıralama formu isteğe bağlı açılır. Sıralama tek başına uygulanabilir; sorgu durumu yalnız başarılı sonuçtan sonra değişir. Sayfa boyutu değişince ilk sayfa yüklenir; hata sonrası aynı işlem yeniden denenebilir.
- Yükleme ve sonuç özeti ayrı canlı durum alanında duyurulur. Boş arama için temizleme eylemi, sütun seçiminde en az bir alan kuralı ve CSV'nin yalnız görünen satırları içerdiği bilgisi gösterilir. Veri paneli metinleri `rem` ile büyür; uzun alan adları satır kırar.
- Yer imi ve yetkili erişim pencereleri kullanılabilir ekran yüksekliğine sığar. Azaltılmış hareket, yüksek kontrast ve zorunlu renkler desteklenir.
- Mobil klavye açıldığında paneller ve native pencereler `VisualViewport` yüksekliği ve üst kaymasına göre yerleşir; arama ve kapatma kontrolleri görünür kalır.
- Çevrimdışı, hata, güncelleme, yükleme ve geçici bildirimler tek kaydırılabilir alanda sıralanır. Mobil modal panel veya klavye açıkken bildirim alanı gizlenir; kalıcı bildirimler kapanınca yeniden görünür.

## Tarayıcı doğrulaması

`e2e/layout.pw.ts`, sabit arama, son katman kontrolüne erişim, tüm araçlara klavye ile ilerleme, panel/dock çakışmaları, 320 px telefon ve kısa yatay ekran, veri tablosu kaydırma/arama, odak modundan geri dönüş ve native pencere sınırlarını kontrol eder. Katman kabuğu, yüklenmiş veri paneli ve kaydetme penceresinde axe erişilebilirlik analizi çalışır. Bu testlerde GIS transport fixture kullanılır; gerçek servis ve SDK doğrulaması ayrı `test:live` kapısında yapılır.

`e2e/overlays.pw.ts`, eşzamanlı bildirimlerin çakışmamasını, mobil modal sırasında bildirimlerin korunmasını, klavye ve görünür ekran kayması altında panel/pencere sınırlarını, yetkili erişim penceresindeki hata ve erişilebilirlik durumunu doğrular.

`e2e/data-workspace.pw.ts`, filtresiz sıralama, klavyeyle sorgu uygulama ve temizleme, tutarlı sayfalama, başarısız sorguyu tekrar deneme, eski yanıtın yeni katmana yazılmaması, boş aramadan geri dönüş, seçili sütun/satır CSV kapsamı ve yüzde 200 metin boyutunda erişilebilir yerleşimi kontrol eder.

## ArcGIS Web Components

v7'de kullanıcıya dönük ArcGIS kontrolleri `@arcgis/map-components` kullanır. React 19 custom-element desteği sayesinde ek React wrapper paketine ihtiyaç duyulmaz. Core API yalnız katman, SceneView, kamera ve sorgu gibi düşük seviye yetenekler için kullanılır.

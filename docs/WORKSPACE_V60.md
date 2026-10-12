# v60 çalışma alanı

## Katman hazırlığı ve yaşam döngüsü

LayerView tamamen durulduğunda mevcut hazır olma sinyali korunur. FeatureLayerView arka planda çizim güncellemelerine devam ediyorsa ilk kullanışlı görünüm ayrıca doğrulanır: katman açık, ölçek içinde ve askıya alınmamış olmalı; mevcut harita kapsamındaki yerel `queryFeatureCount` pozitif sonuç vermelidir. SDK arka planda veri/ayrıntı güncellemelerine devam edebilir; hazır durumu ilk kullanılabilir görünümü ifade eder. Ardından iki animasyon karesi beklenir ve aynı LayerView ile aynı kapsamın hâlâ geçerli olduğu kontrol edilir.

Bu kontrol yeni bir uzak servis sorgusu başlatmaz. Her katman için aynı kapsamın sorgusu paylaşılır; yeni kapsam eskisini iptal eder. Beş saniyelik süre sınırı, kapatma ve gözlemci temizliği bekleyen işleri bırakır. Sorgu hatası veya sıfır sonuç hazır olma olarak değerlendirilmez. Görünmeyen katman ve eski harita kapsamı hazır olarak işaretlenmez. Henüz yerel veri yoksa kontrol, tek bekleyen sorguyla saniyede en fazla bir kez ve toplam 90 saniyeyle sınırlı tekrar edilir. Görünüm kapsamı değiştiğinde önceki veri kanıtı bırakılır.

Kurtarma zamanlayıcıları gözlemci kapatıldığında temizlenir. Katman map remove/add arasında kullanıcı tarafından kapatılırsa önbellekteki örnek aynı sıraya, görünürlüğü kapalı olarak geri bağlanır. Yetki hataları tekrar oluşturma döngüsüne girmez. Harici servis ve cihaz performansı için sabit açılış süresi taahhüt edilmez.

Scene hâlâ güncellenirken kurtarma, SDK'nın 60 saniyelik ağ isteği süresini ve 5 saniyelik tamamlanma payını dikkate alır. Böylece yavaş bir export isteği 45 saniyede gereksiz yere iptal edilmez. Basınç/navigasyon için toplam kurtarma beklemesi yine 90 saniyeyle sınırlıdır; normal, durulmuş bir görünümde takılan çizim mevcut tür bazlı süreyle kurtarılır.

## Harita araçları

Sekiz araç ortak Türkçe adlar ve araca özel kullanım yönergeleri kullanır. Pencere yüklenme, hazır ve hata durumlarını gösterir; hata durumunda aynı araç yeniden denenebilir. SDK `arcgisReady` dinleyicisi bağlantı kurulmadan önce eklenir. Pencere kapanınca bekleme iptal edilir; geç gelen modül eski pencereye eklenmez. Hazırlanmayan bileşen 15 saniye sonunda temizlenir ve yeniden deneme sunulur.

Telefonda araç ve ayrıntı pencereleri alt araç çubuğu, durum çubuğu ve cihazın güvenli alanı için boşluk bırakır; yeniden deneme düğmesi durum çubuğunun arkasında kalmaz.

Harita navigasyonu çalışma pencerelerinin altında kalır. Kısa veya dar ekranlarda tam ekran/konum düğmeleri pencerelerin kapatma düğmesini engellemez. Arayüz testindeki navigasyon kontrolleri de gerçek bileşenlerin yer kaplamasını temsil eder; 320 px telefon, yatay telefon ve tablette kapatma düğmesinin fiziksel olarak tıklanabildiği kontrol edilir.

Güncel görünüm sistemindeki tablet araç penceresi SDK'nın en az 300 px genişlik isteyen kontrollerini sığdırır. 1100 px ve altındaki ekranlarda bir harita aracı seçildiğinde çalışma paneli kapanır ve haritada işlem yapmak için alan açılır. Canlı tarayıcı kontrolü gerçek SDK alan ölçümü arayüzünü telefon ve tablette yatay taşma açısından da doğrular.

Altlık galerisindeki altı seçenek, üst bölüm, yer imleri ve paylaşım tercihleriyle aynı sözleşmeyi kullanmaya devam eder. Kesit, görüş hattı ve gölge araçları için veri gereksinimleri yönergede açıklanır.

## Teknoloji ve doğrulama

Haritada nesne seçimi son tıklamaya aittir. Önceki tıklamanın geç tamamlanan sonucu veya hatası yeni seçimi değiştiremez. Detay penceresi kapatıldığında, kamera hareket ettiğinde, sekme değiştiğinde veya harita oturumu kapandığında bekleyen seçim geçersiz olur. Mesafe/alan, kesit, görüş hattı ve profil araçları harita tıklamasını kullanırken nesne sorgusu başlatılmaz; bu koruma araç yüklenirken de geçerlidir. Pasif araç açıkken nesne seçmek detayları açar ve araç penceresini kapatır. Dar ekranda detaylar çalışma paneliyle çakışmaz.

Nesne detaylarındaki arama alan adı ve değer içinde Türkçe büyük/küçük harf duyarlılığı olmadan çalışır. Eşleşen alan sayısı ve boş arama sonucu erişilebilir şekilde gösterilir; yeni nesne seçildiğinde arama sıfırlanır.

Açılışta küçük TypeScript bootstrap önce görünür; ağır uygulama modülü dinamik yüklenir. 4,5 saniyelik gecikme hata olarak gösterilmez, anlaşılır bekleme mesajı sunulur. Gerçek modül yükleme hatası veya 60 saniyelik süre aşımında bağlantı açıklaması ve erişilebilir yeniden yükleme düğmesi gösterilir. Sayfa açıldığında zamanlayıcı temizlenir. Gecikme, gerçek modül hatası ve yeniden yükleyerek kurtarma arayüz testinde doğrulanır.

- React 19, TypeScript 7 ve Vite 8 mimarisi korunur; uygulamanın yanında bütün birim testleri de strict TypeScript kontrolüne alınır.
- ArcGIS core/map/common paketleri birlikte tam 5.1.27 sürümüne sabitlenir. Bağımlılık doğrulayıcı üç paketin eşleşmesini zorunlu kılar. Vitest 5.0.4 kullanılır.
- PWA shell/data cache nesli v60'tır. Üretim doğrulayıcısı paket sürümüyle eşleşmesini kontrol eder.
- `npm run check`: katalog/sağlık/navigasyon doğrulamaları, strict tip kontrolü, birim testleri ve üretim paketi.
- `npm run test:e2e`: masaüstü, telefon ve tablette 33 senaryo; panel sınırları, klavye kullanımı, WCAG kontrolleri, hata sonrası araç yeniden denemesi ve geciken/başarısız açılıştan kurtarma.
- `npm run test:live`: üretim paketinde gerçek SDK ile 10 halka açık katmanın çizim kanıtı ve önbellekten yeniden açılışı; sekiz araçta gerçek SDK hazırlığı; altlık tercih senkronizasyonu ve haritaya iki nokta yerleştirerek mesafe ölçümü. Ekran görüntüleri ve süreler CI artifact olarak saklanır.

Kaynak IP izni gerektiren 10 TUCBS katmanı halka açık canlı testten ayrıdır. Bunların doğrulanması tarayıcıdaki yetkili erişim akışında, onaylı IP üzerinden yapılır; gizli URL veya kimlik bilgisi repository'ye yazılmaz.

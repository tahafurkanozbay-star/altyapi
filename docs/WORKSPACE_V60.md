# v60 çalışma alanı

## Katman hazırlığı ve yaşam döngüsü

LayerView tamamen durulduğunda mevcut hazır olma sinyali korunur. FeatureLayerView arka planda çizim güncellemelerine devam ediyorsa ilk kullanışlı görünüm ayrıca doğrulanır: katman açık, ölçek içinde ve askıya alınmamış olmalı; veri güncellemesi bitmiş olmalı; SDK görünüm verisinin eksik olduğunu bildirmemeli; mevcut harita kapsamındaki yerel `queryFeatureCount` pozitif sonuç vermelidir. Ardından iki animasyon karesi beklenir ve aynı LayerView ile aynı kapsamın hâlâ geçerli olduğu kontrol edilir.

Bu kontrol yeni bir uzak servis sorgusu başlatmaz. Her katman için aynı kapsamın sorgusu paylaşılır; yeni kapsam eskisini iptal eder. Beş saniyelik süre sınırı, kapatma ve gözlemci temizliği bekleyen işleri bırakır. Sorgu hatası veya sıfır sonuç hazır olma olarak değerlendirilmez. Tamamlanmamış veri, görünmeyen katman ve eski harita kapsamı erken hazır olarak işaretlenmez.

Kurtarma zamanlayıcıları gözlemci kapatıldığında temizlenir. Katman map remove/add arasında kullanıcı tarafından kapatılırsa önbellekteki örnek aynı sıraya, görünürlüğü kapalı olarak geri bağlanır. Yetki hataları tekrar oluşturma döngüsüne girmez. Harici servis ve cihaz performansı için sabit açılış süresi taahhüt edilmez.

## Harita araçları

Sekiz araç ortak Türkçe adlar ve araca özel kullanım yönergeleri kullanır. Pencere yüklenme, hazır ve hata durumlarını gösterir; hata durumunda aynı araç yeniden denenebilir. SDK `arcgisReady` dinleyicisi bağlantı kurulmadan önce eklenir. Pencere kapanınca bekleme iptal edilir; geç gelen modül eski pencereye eklenmez. Hazırlanmayan bileşen 15 saniye sonunda temizlenir ve yeniden deneme sunulur.

Telefonda araç ve ayrıntı pencereleri alt araç çubuğu, durum çubuğu ve cihazın güvenli alanı için boşluk bırakır; yeniden deneme düğmesi durum çubuğunun arkasında kalmaz.

Altlık galerisindeki altı seçenek, üst bölüm, yer imleri ve paylaşım tercihleriyle aynı sözleşmeyi kullanmaya devam eder. Kesit, görüş hattı ve gölge araçları için veri gereksinimleri yönergede açıklanır.

## Teknoloji ve doğrulama

- React 19, TypeScript 7 ve Vite 8 mimarisi korunur; uygulamanın yanında bütün birim testleri de strict TypeScript kontrolüne alınır.
- ArcGIS core/map/common paketleri birlikte tam 5.1.27 sürümüne sabitlenir. Bağımlılık doğrulayıcı üç paketin eşleşmesini zorunlu kılar. Vitest 5.0.4 kullanılır.
- PWA shell/data cache nesli v60'tır. Üretim doğrulayıcısı paket sürümüyle eşleşmesini kontrol eder.
- `npm run check`: katalog/sağlık/navigasyon doğrulamaları, strict tip kontrolü, birim testleri ve üretim paketi.
- `npm run test:e2e`: masaüstü, telefon ve tablette 15 senaryo; panel sınırları, klavye kullanımı, WCAG kontrolleri, hata sonrası araç yeniden denemesi.
- `npm run test:live`: üretim paketinde gerçek SDK ile 10 halka açık katmanın çizim kanıtı ve önbellekten yeniden açılışı; sekiz araçta gerçek SDK hazırlığı; altlık tercih senkronizasyonu ve haritaya iki nokta yerleştirerek mesafe ölçümü. Ekran görüntüleri ve süreler CI artifact olarak saklanır.

Kaynak IP izni gerektiren 10 TUCBS katmanı halka açık canlı testten ayrıdır. Bunların doğrulanması tarayıcıdaki yetkili erişim akışında, onaylı IP üzerinden yapılır; gizli URL veya kimlik bilgisi repository'ye yazılmaz.

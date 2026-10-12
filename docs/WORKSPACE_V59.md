# v59: Başlangıç render stabilitesi ve baskı-farkındalıklı LayerView recovery

v58 ile katman hazır olma sinyali gerçek ArcGIS LayerView durumuna bağlandı ve 10 kamu
katmanı production tarayıcıda gerçek sağlayıcı verisiyle doğrulandı. İlk canlı koşu
ayrıca önemli bir başlangıç davranışını görünür kıldı: varsayılan SINIRLAR katmanı
uygulama ve SDK aynı anda ilk kez yüklenirken 26 saniyelik FeatureLayer stall
eşiğine ulaşabiliyor, watchdog LayerView'ı recycle ettiği için henüz tamamlanmakta
olan render tekrar baştan başlayabiliyordu.

v59 bu false-positive recovery döngüsünü kaldırır:

- LayerView gözlemleri deprecated Accessor `.watch()` yerine
  `reactiveUtils.watch(..., { initial: true })` ile tek birleşik watcher üzerinden
  yürütülür.
- Normal, sakin bir Scene'de mevcut servis-türü stall eşikleri korunur; gerçek
  takılmalar hâlâ hızlıca kurtarılır.
- Scene ilk yükleme/navigasyon nedeniyle güncelleniyorsa recycle için 45 saniyelik
  sınırlı grace uygulanır.
- Main thread `busy` veya `critical` baskı altındaysa ya da Scene hâlâ hareket
  ediyorsa grace en fazla 90 saniyeye uzar. Bu üst sınır aşıldığında recovery
  yine devreye girer; sonsuz bekleme yoktur.
- Stabil render gerçekleştiğinde ilk LayerView oluşturulmasından itibaren geçen
  süre `elapsedMs` olarak sağlık olayına eklenir. Tarayıcı sağlık hafızası bu
  anonim süreyi kullanabilir; URL, token veya sağlayıcı payload'ı saklanmaz.
- Recovery sırasında başlangıç zamanı korunur; başarılı render veya kesin hata
  sonrasında temizlenir.

Canlı production testi artık önce varsayılan başlangıç katmanının gerçekten
`data-render-state="ready"` olmasını doğrular. Ardından görünümü nötrleyip 10
kamu katmanını tek tek açar, LayerView `visible / in-scale / settled` durumunu,
ekran görüntüsünü, ilk açılış ve cache üzerinden yeniden açılış sürelerini
ölçmeye devam eder.

TUCBS'nin 10 IP-kısıtlı katmanı public GitHub runner'da zorla test edilmez.
Bunların erişim, ölçek ve kapsam doğrulaması onaylı dış IP'yi kullanan tarayıcıda
yapılmaya devam eder; korumalı endpoint'ler rapor veya artifact'a yazılmaz.

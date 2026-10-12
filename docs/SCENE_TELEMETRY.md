# Harita bilgileri: ilk açılış ve dokunmatik gezinme

Ölçek ve koordinat bilgisi yalnızca `arcgisViewPointerMove` olayından
güncellendiği için haritaya fareyle girmeyen kullanıcılar ölçek alanında `—`
görüyordu. Dokunmatik yakınlaştırma ve programlı katman navigasyonu da bu
bilgiyi güncellemiyordu.

Runtime artık Scene hazır olduğunda, `arcgisViewChange` olayında ve sekmeye
geri dönüldüğünde gerçek Scene ölçeğini ve harita merkezini yayınlar. Fare
haritada hareket ettiğinde koordinatlar imlecin konumunu gösterir; kamera
hareketi veya haritadan çıkışta tekrar güncel harita merkezi kullanılır.

Güncellemeler tek bir `requestAnimationFrame` içinde birleştirilir. Gizli
sekmede yayın yapılmaz; runtime kapatıldığında bekleyen frame ve bütün
dinleyiciler temizlenir. Harita, katman ve sağlayıcı yükleme politikaları
değişmez.

Beş runtime regresyon testi ilk açılışı, fare gerektirmeyen navigasyonu,
pointer örneklerinin birleştirilmesini, sekmeye dönüşü ve temizlemeyi doğrular.
Production canlı testi başlangıç ölçeğini ve her katman açıldıktan sonraki
ölçeği gerçek SDK değeriyle karşılaştırır.

Aynı production testinde sekiz harita aracı gerçek SDK bileşenleriyle açılır.
`arcgisReady` olayı, Scene bağlantısı, görünürlük ve panel kapatıldığında
bileşenin kaldırılması doğrulanır. Her araç için ekran görüntüsü ve açılış
süresi test artifact'ına eklenir; bu adım runtime fixture kullanmaz.

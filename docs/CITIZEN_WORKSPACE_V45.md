# Citizen Workspace v45

v45, Ankara Kent Rehberi'nin vatandaş arayüzünü yalnız katman açıp kapatan bir haritadan, tekrar kurulabilir bir **çalışma görünümü** modeline taşır. Amaç teknik seçenekleri çoğaltmak değil; kullanıcının haritada oluşturduğu anlamlı görünümü kaybetmeden yönetebilmesidir.

## Dil ve platform kararı

Uygulama strict TypeScript 7 + React 19 + ArcGIS Maps SDK 5.1 component-first mimarisinde kalır. ArcGIS tarayıcı SDK'sını Rust/C++ gibi farklı bir dile zorla taşımak yeni bir WebAssembly/JavaScript köprü katmanı, daha fazla bundle maliyeti ve daha geniş hata yüzeyi oluşturacağından v45'te yapılmaz. First-party uygulama, worker, service worker, test ve mühendislik araçlarının dili TypeScript'tir.

## Katman çizim sırası

Katmanlar panelinde açık katmanlar için ayrı bir **Açık katman yığını** gösterilir. Liste yukarıdan aşağıya haritadaki çizim önceliğini temsil eder. Kullanıcı bir katmanı yukarı veya aşağı taşıdığında tercih kalıcı olarak saklanır ve ArcGIS Map içindeki operational layer sırası aynı anda güncellenir.

Sıralama yalnız görünen komşular arasında yapılır; kapalı/cache'teki katmanların göreli konumu korunur. Böylece bir katman yeniden açıldığında beklenmedik biçimde en üste sıçramaz. Runtime yeni yüklenen veya yeniden bağlanan katmanlardan sonra da aynı deterministik sırayı tekrar uygular.

## Tam çalışma görünümü yer imleri

Yeni yer imleri şu bilgileri birlikte saklar:

- kamera konumu ve 3B bakış açısı,
- açık katmanlar,
- açık katmanların saydamlıkları,
- açık katmanların üstten alta çizim sırası,
- seçili altlık harita.

v44 ve daha eski yer imleri geriye dönük uyumludur; yeni alanların tamamı opsiyoneldir. Eski bir yer imi yalnız kamera ve katman görünürlüğüyle çalışmaya devam eder.

Yer imi adı artık bloklayıcı `window.prompt()` ile alınmaz. Native `<dialog>` tabanlı, klavye ve ekran okuyucu dostu bir isimlendirme akışı kullanılır.

## Paylaşım ve tam ekran

Paylaşımda Web Share API bulunan cihazlarda işletim sisteminin doğal paylaşım paneli kullanılır. Destek yoksa clipboard, o da yoksa adres çubuğu fallback'i korunur. Paylaşım URL'sindeki katman listesi mevcut çizim sırasına göre üretilir; bu sıra başka istemcide başlangıç sırası olarak kullanılabilir.

`F` kısayolu Fullscreen API varlığını kontrol eder. Desteklemeyen veya izin vermeyen tarayıcılarda unhandled rejection üretmek yerine kullanıcıya anlaşılır geri bildirim verilir.

## Kalıcı tercih migrasyonu

Tercih şeması `altyapi:preferences:v5` oldu. v4/v3/v2 kayıtları güvenli biçimde okunur ve ilk başarılı kayıtta v5'e taşınır. `layerOrder` alanı eksikse katalog sırası deterministik varsayılan olur.

## Erişilebilirlik ve responsive davranış

`experience-v45.css`, v43/v44 katmanlarının üzerine eklenir. Yeni katman yığını ve çalışma görünümü dialog'u:

- görünür `:focus-visible` halkalarına,
- forced-colors desteğine,
- mobil safe viewport ölçülerine,
- büyük dokunma hedeflerine,
- reduced-motion uyumuna,
- uzun katman adlarında güvenli satır kırılımına

sahiptir.

## PWA nesli

Uygulama sürümü `45.0.0`, shell/data cache nesli `v45` olarak birlikte döndürülür. Eski cache'ler activate aşamasında temizlenmeye devam eder; canlı servis, health ve navigation JSON dosyaları network-first/no-store politikasını korur.

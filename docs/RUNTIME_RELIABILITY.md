# Runtime Reliability

Başkent 3B CBS v11, dış servislerin değişken davranışını yalnız sağlık snapshot'ı ile değil, tarayıcı çalışma zamanındaki asenkron yarış koşullarını da kontrol ederek yönetir.

## Latest intent wins

Bir katman yüklenirken kullanıcı aynı katmanı kapatabilir veya tekrar açabilir. Eski mimarilerde ilk asenkron `load()` tamamlandığında daha yeni kullanıcı kararını yanlışlıkla geri çevirebilir.

v11 bu durumu iki yapı ile çözer:

- `desiredVisibility`: her servis için kullanıcının en son istediği görünürlük
- `loadingLayers`: aynı servis için devam eden yüklemeyi tek promise altında tutan in-flight kayıt

Yükleme tamamlandığında en son istek artık görünür değilse sonuç `superseded: true` döner ve React state'i eski sonuçla güncellenmez.

## Bounded timeout

ArcGIS ve dış servis çağrıları sonsuza kadar bekletilmez.

- layer factory / lazy import: 12 saniye
- layer load: 22 saniye
- query layer hazırlığı: 20 saniye
- Feature/Scene attribute query: 25 saniye

Timeout olduğunda yükleme başarısız sayılır, katman güvenli biçimde map'ten ayrılır ve devre kesici / incident akışına aktarılır.

## Retry güvenliği

`reloadLayer()` devam eden yüklemeyi önce görünmez niyete geçirir ve in-flight işlemin settle olmasını bekler. Ardından eski layer instance'ı destroy edilir ve yeni bir yükleme başlatılır. Bu yaklaşım aynı servis için eşzamanlı eski/yeni layer instance yarışını azaltır.

## Olay günlüğü

Tarayıcıda en fazla 80 adet runtime olayı saklanır:

- boot
- network
- layer-load
- layer-retry
- query
- system

Mesajlar kaydedilmeden önce URL, token parametresi ve uzun secret-benzeri diziler maskelenir. Olay günlüğü servis endpoint'lerini veya token değerlerini bilerek saklamaz.

Kullanıcı Olay Günlüğü panelinden kaydı JSON olarak dışa aktarabilir veya temizleyebilir.

## Kapsam ve sınırlar

Bu mekanizma ağ seviyesinde gerçek HTTP isteğini her durumda iptal etmez; bazı ArcGIS `load()` işlemleri timeout sonrasında altta tamamlanabilir. Ancak stale completion uygulama state'ini geri çeviremez ve ilgili layer instance teardown edilir. Amaç UI tutarlılığı, bounded waiting ve güvenli recovery'dir.

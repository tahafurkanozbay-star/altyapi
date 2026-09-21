# Scale-Aware Service Navigation

Başkent 3B CBS v12.1, geniş görünümde yavaşlayan veya gerçek veri kapsamı ile servis metadata kapsamı uyuşmayan katmanları güvenli biçimde yönetir.

## Canlı doğrulama sonucu

Doğrulama 21 Eylül 2026 tarihinde GitHub Actions üzerinden gerçek servis istekleriyle yapıldı. Test çıktılarında endpoint veya token yazdırılmadı.

### Altyapı MapServer katmanları

Aşağıdaki altı katmanın gerçek veri kapsamı ArcGIS `returnExtentOnly=true&outSR=4326` sorgusuyla doğrulandı:

- Yağmur Suyu Eleman
- Yağmur Suyu Boru
- Pis Su Boru
- Pis Su Eleman
- İçme Suyu Eleman
- İçme Suyu Boru

Servis metadata'sındaki deklaratif extent bu katmanlarda çok geniş bir WKID 5255 kapsamı döndürüyordu. Bu yüzden eski `layer.fullExtent` tabanlı zoom davranışı kullanıcıyı gerçek çalışma alanından uzaklaştırabiliyordu. v12.1, doğrulanmış WGS84 veri extentlerini kullanır.

## Ölçek testi

Altı altyapı katmanında Ankara merkezli 256×256 MapServer export isteği 1:250.000, 1:300.000, 1:350.000, 1:400.000, 1:450.000, 1:500.000 ve 1:600.000 ölçekte çalıştırıldı.

| Ölçek | Başarılı servis | En yavaş export hazırlığı |
| --- | ---: | ---: |
| 1:250.000 | 6/6 | 5,8 sn |
| 1:300.000 | 6/6 | 7,5 sn |
| 1:350.000 | 6/6 | 9,8 sn |
| 1:400.000 | 6/6 | 11,0 sn |
| 1:450.000 | 6/6 | 12,5 sn |
| 1:500.000 | 6/6 | 14,1 sn |
| 1:600.000 | 4/6 | 16 sn timeout |

İçme Suyu Eleman ve İçme Suyu Boru 1:600.000 testinde zaman aşımına düştü. Bu nedenle ortak güvenli çalışma tavanı 1:400.000 seçildi. 1:300.000 ise katman açılışında önerilen başlangıç ölçeğidir.

Bu eşik sunucunun resmi `minScale` metadata'sı değildir; gerçek export süresi ölçümlerinden türetilmiş istemci güvenlik politikasıdır.

## Uygulama İmar Planı

UYGULAMA İMAR PLANI (UIP ESRI3) servisi kendi metadata'sında ölçek bağımlılığını açıkça bildirir:

- en uzak görünür ölçek: **1:2.311.162**
- en yakın görünür ölçek: **1:1.128**

v12.1 bu sunucu aralığını değiştirmez; istemciye aynen uygular ve katman açılırken gerekirse kullanıcıyı aralığın içine taşır.

## Çalışma modeli

`public/service-navigation.json` yalnız şu tür sanitizasyonlu bilgileri taşır:

- katalog indexi
- katman adı ve servis türü
- WGS84 çalışma extent'i
- operasyonel `minScale` / `maxScale`
- önerilen açılış ölçeği
- doğrulama kaynağı ve zamanı

URL, token veya gizli endpoint alanı içermez.

Katman açılırken:

1. Mevcut kamera doğrulanmış extent içinde ve çalışma ölçeğindeyse görünüm değiştirilmez.
2. Kamera extent dışındaysa extent merkezine gidilir.
3. Görünüm fazla uzaktaysa önerilen çalışma ölçeğine yaklaşılır.
4. Katman ArcGIS `minScale/maxScale` ile oluşturulur; kullanıcı sınırın dışına zoom yaptığında geniş ve pahalı render isteği gönderilmez.
5. Kullanıcı tekrar çalışma aralığına döndüğünde katman otomatik görünür hale gelir.

Bu tasarım haritayı genel olarak kilitlemez; yalnız ilgili katmanın çizim isteklerini doğrulanmış çalışma aralığıyla sınırlar.

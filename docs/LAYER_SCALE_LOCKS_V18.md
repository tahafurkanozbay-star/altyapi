# Katman Bazlı Zoom Kilitleri v18

Bu sürümün amacı, ölçeğe duyarlı bir servis açıkken haritayı o servisin gerçekten çalıştığı aralıkta tutmak ve katman kapanır kapanmaz ilgili kısıtı kaldırmaktır.

## Davranış

- Katman açılırken varsa `recommendedScale` değerine gidilir.
- Katman açık kaldığı sürece `operationalMinScale` / `operationalMaxScale` dışına çıkılmasına izin verilmez.
- Kullanıcı sınırı aşarsa harita tam sınırın üzerine değil, sayısal yuvarlama ve animasyon hatalarını önlemek için %1,5 içerideki güvenli ölçeğe alınır.
- Katman kapatıldığında o katmanın zoom profili aktif kesişimden çıkarılır. Başka kısıtlı katman yoksa zoom tamamen serbest kalır.
- Birden fazla kısıtlı katman açıksa ortak güvenli aralık kullanılır.
- Sağlayıcı hiçbir ölçek sınırı ilan etmiyorsa uygulama keyfi bir sınır uydurmaz.

## 20 katmanın tek tek politikası

| # | Katman | Tür | Zoom politikası |
|---|---|---|---|
| 1 | DOĞALGAZ DAĞITIM İSTASYONU | WMS | Onaylı istemci IP'sinden WMS GetCapabilities ile öğrenilir |
| 2 | DOĞALGAZ DAĞITIM İSTASYONU | WFS | Aynı veri kümesinin doğrulanmış WMS ölçek profili kullanılır |
| 3 | DOĞALGAZ DEPOLAMA TESİSİ | WFS | Aynı veri kümesinin doğrulanmış WMS ölçek profili kullanılır |
| 4 | DOĞALGAZ DEPOLAMA TESİSİ | WMS | Onaylı istemci IP'sinden WMS GetCapabilities ile öğrenilir |
| 5 | DOĞALGAZ HATTI | WMS | Onaylı istemci IP'sinden WMS GetCapabilities ile öğrenilir |
| 6 | DOĞALGAZ HATTI | WFS | Aynı veri kümesinin doğrulanmış WMS ölçek profili kullanılır |
| 7 | DOĞALGAZ SERVİS KUTUSU | WFS | Aynı veri kümesinin doğrulanmış WMS ölçek profili kullanılır |
| 8 | DOĞALGAZ SERVİS KUTUSU | WMS | Onaylı istemci IP'sinden WMS GetCapabilities ile öğrenilir |
| 9 | DOĞALGAZ VANA | WFS | Aynı veri kümesinin doğrulanmış WMS ölçek profili kullanılır |
| 10 | DOĞALGAZ VANA | WMS | Onaylı istemci IP'sinden WMS GetCapabilities ile öğrenilir |
| 11 | YAĞMUR SUYU ELEMAN | MapServer | `minScale=400000`, önerilen `300000` |
| 12 | YAĞMUR SUYU BORU | MapServer | `minScale=400000`, önerilen `300000` |
| 13 | PİS SU BORU | MapServer | `minScale=400000`, önerilen `300000` |
| 14 | PİS SU ELEMAN | MapServer | `minScale=400000`, önerilen `300000` |
| 15 | İÇME SUYU ELEMAN | MapServer | `minScale=400000`, önerilen `300000` |
| 16 | İÇME SUYU BORU | MapServer | `minScale=400000`, önerilen `300000` |
| 17 | UYGULAMA İMAR PLANI (UIP ESRI3) | MapServer | `minScale=2311162`, `maxScale=1128`, önerilen `1800000` |
| 18 | SINIRLAR | FeatureServer | Sağlayıcı ölçek sınırı ilan etmiyor; zoom serbest |
| 19 | 3D1234 WFL1 | FeatureServer | Sağlayıcı ölçek sınırı ilan etmiyor; zoom serbest |
| 20 | 3D1234 WSL2 | SceneServer | Sağlayıcı ölçek sınırı ilan etmiyor; zoom serbest |

## TUCBS ölçek öğrenme

TUCBS servisleri kaynak IP ile sınırlandırıldığı için GitHub Actions gerçek yetkili `GetCapabilities` yanıtını göremez. Yetkili servis JSON'u kullanıcı tarayıcısında doğrulanırken WMS yanıtındaki `MinScaleDenominator` ve `MaxScaleDenominator` değerleri okunur.

OGC ve ArcGIS adlandırmaları ters yöndedir:

- WMS `MaxScaleDenominator` → ArcGIS `operationalMinScale` (en uzak zoom-out sınırı)
- WMS `MinScaleDenominator` → ArcGIS `operationalMaxScale` (en yakın zoom-in sınırı)

Ölçek profili yalnız sayısal değerler ve doğrulama zamanı olarak local/session storage'da saklanır. İmzalı TUCBS URL'si ölçek profiline veya public raporlara kopyalanmaz. WFS standardı bir render ölçek sınırı taşımadığından aynı mantıksal veri kümesinin doğrulanmış WMS profili WFS eşine aktarılır.

## Güvenli sınır içi kilit

ArcGIS ve OGC sağlayıcıları sınır değerlerinde kayan nokta/animasyon farkları nedeniyle bir kareliğine görünmez olabilir. Bu nedenle kullanıcı dışarı çıktığında tam `1:400.000` yerine yaklaşık `1:394.000` gibi %1,5 içeride bir değere getirilir. Kullanıcı zaten geçerli aralıktaysa ölçeğe müdahale edilmez.

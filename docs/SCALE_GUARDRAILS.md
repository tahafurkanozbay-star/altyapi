# Servis Ölçek / Zoom Guardrail'leri

Bu belge `public/services.json` içindeki 20 servisin ölçek davranışının canlı servis metadata'sı ve mevcut doğrulanmış navigasyon profilleriyle nasıl ele alındığını açıklar.

## Son canlı denetim

Denetim komutu:

```bash
npm run audit:scales
```

Son GitHub Actions denetimi: **24 Eylül 2026**.

Sonuç özeti:

- 20 servis tek tek denetlendi.
- 10 servis canlı metadata / capabilities yanıtı verdi.
- 10 UCBP WMS/WFS servisi `GetCapabilities` aşamasında HTTP 500 döndürdü; bu nedenle bu servislerin varsa ölçek kısıtları doğrulanamadı.
- Canlı yanıt veren servisler içinde yalnız **UYGULAMA İMAR PLANI (UIP ESRI3)** sunucu metadata'sında açık bir ölçek aralığı ilan ediyor: **1:2.311.162 – 1:1.128**.
- Altı ABB altyapı MapServer katmanı sunucu metadata'sında ölçek sınırı ilan etmiyor. Ancak önceki çok-ölçekli canlı render testlerinde geniş görünümlerde performans sınırı doğrulandığı için uygulamanın mevcut **1:400.000 ve daha yakın** operasyon guardrail'i korunur.
- SINIRLAR, 3D1234 WFL1 ve 3D1234 WSL2 için canlı metadata'da zorunlu ölçek sınırı bulunmadı; bu katmanlarda zoom zorlaması uygulanmaz.

## Tek tek servis sonucu

| # | Katman | Tür | Canlı denetim | Sunucunun ilan ettiği ölçek | Uygulama politikası |
|---:|---|---|---|---|---|
| 1 | DOĞALGAZ DAĞITIM İSTASYONU | WMS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 2 | DOĞALGAZ DAĞITIM İSTASYONU | WFS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 3 | DOĞALGAZ DEPOLAMA TESİSİ | WFS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 4 | DOĞALGAZ DEPOLAMA TESİSİ | WMS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 5 | DOĞALGAZ HATTI | WMS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 6 | DOĞALGAZ HATTI | WFS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 7 | DOĞALGAZ SERVİS KUTUSU | WFS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 8 | DOĞALGAZ SERVİS KUTUSU | WMS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 9 | DOĞALGAZ VANA | WFS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 10 | DOĞALGAZ VANA | WMS | HTTP 500 | Doğrulanamadı | Zorunlu zoom sınırı eklenmez |
| 11 | YAĞMUR SUYU ELEMAN | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 12 | YAĞMUR SUYU BORU | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 13 | PİS SU BORU | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 14 | PİS SU ELEMAN | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 15 | İÇME SUYU ELEMAN | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 16 | İÇME SUYU BORU | MapServer | Metadata erişilebilir | Yok | Doğrulanmış render performansı nedeniyle 1:400.000 ve daha yakın |
| 17 | UYGULAMA İMAR PLANI (UIP ESRI3) | MapServer | Metadata erişilebilir | **1:2.311.162 – 1:1.128** | Sunucunun ilan ettiği aralık sürekli uygulanır |
| 18 | SINIRLAR | FeatureServer | Metadata erişilebilir | Yok | Zoom sınırı yok |
| 19 | 3D1234 WFL1 | FeatureServer | Metadata erişilebilir | Yok | Zoom sınırı yok |
| 20 | 3D1234 WSL2 | SceneServer | Metadata erişilebilir | Yok | Zoom sınırı yok |

## Runtime davranışı

`ArcGISRuntime` yalnız bir katman açılırken başlangıç ölçeğini düzeltmekle kalmaz. Ölçek kısıtı olan katman görünür kaldığı sürece `arcgisViewChange` olaylarını izler ve sahnenin ölçeğini izin verilen aralığa geri sıkıştırır.

ArcGIS ölçek adlandırması ters görünebilir:

- `minScale`: en uzak görünüm, yani daha büyük payda.
- `maxScale`: en yakın görünüm, yani daha küçük payda.

Örnek olarak UIP için kullanıcı 1:5.000.000 seviyesine uzaklaşmaya çalışırsa görünüm en fazla **1:2.311.162** seviyesinde tutulur. 1:500 seviyesine aşırı yaklaşmaya çalışırsa en fazla **1:1.128** seviyesine kadar yaklaşmasına izin verilir.

Birden fazla kısıtlı katman aynı anda açıksa sistem tüm aktif katmanların izin verdiği **ortak ölçek kesişimini** uygular. Örneğin 1:400.000 ve daha yakın çalışan bir altyapı katmanı ile UIP birlikte açıksa ortak aralık **1:400.000 – 1:1.128** olur.

Teorik olarak iki aktif katmanın aralıkları hiç kesişmezse tek bir ölçek ikisini aynı anda tatmin edemez. Bu durumda son açılan kısıtlı katmanın aralığı öncelik kazanır; bu davranış kodda açık ve test edilmiş bir fallback'tir.

## Güvenlik

Audit çıktısı endpoint URL'si veya token değerlerini rapora yazmaz. Repo public olduğu için test loglarında ve belgelerde servis erişim anahtarları tekrar edilmez.

# Servis Ölçek / Zoom Guardrail'leri

Bu belge `public/services.json` içindeki 20 servisin ölçek davranışının canlı servis metadata'sı ve mevcut doğrulanmış navigasyon profilleriyle nasıl ele alındığını açıklar.

## Son canlı denetim

Denetim komutu:

```bash
npm run audit:scales
```

Son doğrudan servis denetimi: **24 Eylül 2026**.

Sonuç özeti:

- 20 servis tek tek denetlendi.
- 10 servis canlı metadata / capabilities yanıtı verdi.
- Denetim sırasında kullanılan 10 UCBP WMS/WFS ucu `GetCapabilities` aşamasında HTTP 500 döndürdü; bu nedenle bu servislerin varsa ölçek kısıtları doğrulanamadı.
- Güvenlik sertleştirmesinden sonra public katalogdaki UCBP kayıtları credential içermeyen güvenli-proxy adreslerine yönlendirilmiştir. Üretimde gerçek proxy yapılandırılmadan bu 10 katman otomatik yüklenmez.
- Canlı yanıt veren servisler içinde yalnız **UYGULAMA İMAR PLANI (UIP ESRI3)** sunucu metadata'sında açık bir ölçek aralığı ilan ediyor: **1:2.311.162 – 1:1.128**.
- Altı ABB altyapı MapServer katmanı sunucu metadata'sında ölçek sınırı ilan etmiyor. Ancak önceki çok-ölçekli canlı render testlerinde geniş görünümlerde performans sınırı doğrulandığı için uygulamanın mevcut **1:400.000 ve daha yakın** operasyon guardrail'i korunur.
- SINIRLAR, 3D1234 WFL1 ve 3D1234 WSL2 için canlı metadata'da zorunlu ölçek sınırı bulunmadı; bu katmanlarda zoom zorlaması uygulanmaz.

## Tek tek servis sonucu

| # | Katman | Tür | Canlı denetim | Sunucunun ilan ettiği ölçek | Uygulama politikası |
|---:|---|---|---|---|---|
| 1 | DOĞALGAZ DAĞITIM İSTASYONU | WMS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 2 | DOĞALGAZ DAĞITIM İSTASYONU | WFS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 3 | DOĞALGAZ DEPOLAMA TESİSİ | WFS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 4 | DOĞALGAZ DEPOLAMA TESİSİ | WMS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 5 | DOĞALGAZ HATTI | WMS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 6 | DOĞALGAZ HATTI | WFS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 7 | DOĞALGAZ SERVİS KUTUSU | WFS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 8 | DOĞALGAZ SERVİS KUTUSU | WMS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 9 | DOĞALGAZ VANA | WFS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
| 10 | DOĞALGAZ VANA | WMS | Denetimde HTTP 500 | Doğrulanamadı | Public katalogda secure-proxy gerekli; zorunlu zoom sınırı eklenmez |
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

Guard artık **yükleme tamamlandığında değil, kullanıcı katmanı açma niyetini verdiği anda** devreye girer. Böylece yavaş bir MapServer yüklenirken, başlangıç restore edilirken veya workspace içe aktarılırken kullanıcı doğrulanmış çalışma aralığının dışına çıkamaz. Yükleme başarısız olur ya da katman kapatılırsa pending guard geri alınır.

Yeni bir kısıtlı katman açılmadan önce onun aralığı mevcut açık kısıtlı katmanlarla hesaplanır. Bu sayede ilk navigasyon doğrudan ortak aralığa yapılır ve katman yüklendikten sonra ikinci bir düzeltme/zoom sıçraması oluşmaz.

ArcGIS ölçek adlandırması ters görünebilir:

- `minScale`: en uzak görünüm, yani daha büyük payda.
- `maxScale`: en yakın görünüm, yani daha küçük payda.

Örnek olarak UIP için kullanıcı 1:5.000.000 seviyesine uzaklaşmaya çalışırsa görünüm en fazla **1:2.311.162** seviyesinde tutulur. 1:500 seviyesine aşırı yaklaşmaya çalışırsa en fazla **1:1.128** seviyesine kadar yaklaşmasına izin verilir.

Birden fazla kısıtlı katman aynı anda açıksa sistem tüm aktif katmanların izin verdiği **ortak ölçek kesişimini** uygular. Örneğin 1:400.000 ve daha yakın çalışan bir altyapı katmanı ile UIP birlikte açıksa ortak aralık **1:400.000 – 1:1.128** olur.

Teorik olarak iki aktif katmanın aralıkları hiç kesişmezse tek bir ölçek ikisini aynı anda tatmin edemez. Bu durumda son açılan kısıtlı katmanın aralığı deterministik olarak öncelik kazanır; bu davranış saf fonksiyon testleriyle korunur.

## Sürekli doğrulama

`Service Health Monitor` günlük olarak hem servis erişilebilirliğini hem de `npm run audit:scales` çıktısını üretir. Ölçek raporu artifact olarak yüklenmeden önce URL/token benzeri bilgi taşımadığı ayrıca doğrulanır. Böylece sunucu metadata'sında ölçek davranışı değişirse operasyon ekibi tek raporda erişilebilirlik ve ölçek sinyalini görebilir.

## Güvenlik

Audit çıktısı endpoint URL'si veya token değerlerini rapora yazmaz. `scripts/validate-services.mjs` public katalogda kullanıcı adı/parola, credential query parametresi veya path içine gömülmüş uzun token kalıplarını CI aşamasında reddeder. UCBP gibi kimlik bilgisi gerektiren servisler kurumsal proxy/API gateway arkasından sunulmalıdır.

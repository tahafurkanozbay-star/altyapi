# Runtime Scale Reconciliation v19

v18 katman bazlı zoom kilitlerini katalog ve istemci tarafından öğrenilen TUCBS profillerine bağladı. v19 bu davranışı bir adım daha ileri götürür: ArcGIS katmanı gerçekten yüklendiğinde sağlayıcının canlı `minScale` / `maxScale` metadata'sı okunur ve mevcut profil ile güvenli biçimde uzlaştırılır.

## Neden gerekli?

Bir servis sağlayıcısı zaman içinde görünürlük ölçeğini değiştirebilir. Statik `service-navigation.json` veya geçmişte ölçülmüş bir render sınırı bu değişikliği hemen yansıtmayabilir. Aynı şekilde FeatureServer, SceneServer veya tek alt katmanlı MapServer servisleri kendi metadata'larında uygulamanın önceden bilmediği bir ölçek sınırı ilan edebilir.

v19 iki kaynağı birbirinin alternatifi değil, birlikte çalışan korumalar olarak ele alır:

1. **Doğrulanmış katalog profili** — performans/render ölçümü, servis deklarasyonu veya yetkili TUCBS WMS GetCapabilities sonucu.
2. **Canlı yüklenmiş ArcGIS katman metadata'sı** — `layer.minScale`, `layer.maxScale` veya tek alt katmanlı MapImageLayer için sublayer metadata'sı.

## Birleştirme kuralı

Canlı metadata yalnız mevcut profili **daraltabilir**; daha geniş bir aralık bildirerek önceden doğrulanmış güvenli sınırı gevşetemez.

ArcGIS denominator semantiğine göre:

- `operationalMinScale`: en uzak zoom-out sınırı. İki kaynak varsa daha küçük denominator seçilir.
- `operationalMaxScale`: en yakın zoom-in sınırı. İki kaynak varsa daha büyük denominator seçilir.

Örnek:

- Ölçülmüş güvenli sınır: `minScale=400000`
- Sağlayıcı metadata'sı: `minScale=600000`, `maxScale=1500`
- v19 sonucu: `minScale=400000`, `maxScale=1500`

Böylece performans nedeniyle doğrulanmış `1:400.000` dış sınırı korunurken sağlayıcının yeni yakın-zoom sınırı da devreye girer.

## Katman yaşam döngüsü

- Katman açılmak istendiği anda v18 profili ile zoom guard devreye girer.
- Remote metadata yüklenince v19 canlı ölçeği çıkarır ve guard profilini günceller.
- Yeni canlı profil mevcut görünümü daha dar bir aralıkta gerektiriyorsa harita anında güvenli aralığa alınır.
- Katman kapatılınca `activeScaleServices` içinden çıkar; başka kısıtlı katman yoksa zoom serbest kalır.
- Aynı katman tekrar açılırsa oturum içinde öğrenilen canlı profil ağ isteğinden önce yeniden kullanılır.
- Kullanıcı açıkça `reload` yaptığında canlı profil temizlenir ve sağlayıcı metadata'sı yeniden öğrenilir.

## Provider metadata'yı neden Layer constructor'a yazmıyoruz?

Önceki sürümde `operationalMinScale` / `operationalMaxScale` değerleri ArcGIS Layer constructor'ına da aktarılıyordu. Bu, yüklendikten sonra `layer.minScale` / `layer.maxScale` değerinin gerçekten sağlayıcıdan mı yoksa uygulamanın kendi override'ından mı geldiğini ayırt etmeyi zorlaştırıyordu.

v19'da katalog ölçekleri yalnız **navigasyon guardrail** olarak tutulur. ArcGIS Layer kendi provider metadata'sını özgün biçimde yükler. Sonra iki profil `runtimeScale.ts` içinde kesiştirilir.

## MapServer davranışı

Tek alt katman URL'si (`.../MapServer/0`) için root servis doğrudan ölçek ilan etmiyorsa yüklü tek sublayer'ın `minScale/maxScale` değerleri kullanılabilir.

Çok alt katmanlı MapServer köklerinde ise alt katmanların farklı ölçekleri tek bir yapay aralığa zorlanmaz. Sağlayıcı root seviyesinde bir sınır ilan etmiyorsa mevcut doğrulanmış katalog profili korunur. Bu, tematik UIP gibi servislerde yanlış bir zoom kilidi üretmeyi önler.

## Hata güvenliği

- `0`, negatif, `NaN` veya aşırı büyük scale değerleri yok sayılır.
- `maxScale >= minScale` biçimindeki çelişkili provider aralığı kabul edilmez.
- Çelişkili canlı metadata mevcut geçerli profili bozmaz.
- Canlı metadata hiçbir zaman doğrulanmış güvenli aralığı genişletmez.
- Katman yükleme hatası yaşanırsa mevcut v18 guard davranışı korunur ve başarısız servis aktif zoom kilidinden kaldırılır.

## TUCBS ile ilişki

TUCBS WMS/WFS ölçek öğrenmesi v18'de onaylı istemci IP'sinden GetCapabilities ile yapılmaya devam eder. v19 bunu değiştirmez. Eğer ArcGIS katmanı yüklendikten sonra daha sıkı bir provider ölçeği de bildirirse iki kaynak kesiştirilir. Signed TUCBS URL'si, token veya erişim bilgisi bu süreçte rapora ya da public repoya yazılmaz.

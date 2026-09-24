# 20 Katman Servis Denetimi — 24 Eylül 2026

Bu tablo public katalogdaki her kaydın erişim modeli, ArcGIS/OGC türü ve v16 çalışma politikasını tek tek kayıt altına alır. Signed TUCBS endpoint değerleri özellikle yazılmaz.

| # | Katman | Tür | Erişim / çalışma modeli | v16 politikası |
| ---: | --- | --- | --- | --- |
| 1 | DOĞALGAZ DAĞITIM İSTASYONU | WMS | TUCBS, onaylı istemci dış IP | Browser GetCapabilities doğrulaması; 45+ sn timeout; transient retry; WMS named-layer eşleme |
| 2 | DOĞALGAZ DAĞITIM İSTASYONU | WFS | TUCBS, onaylı istemci dış IP | Browser WFS 2.0 GetCapabilities; 45+ sn timeout; transient retry |
| 3 | DOĞALGAZ DEPOLAMA TESİSİ | WFS | TUCBS, onaylı istemci dış IP | Browser WFS 2.0 GetCapabilities; 45+ sn timeout; transient retry |
| 4 | DOĞALGAZ DEPOLAMA TESİSİ | WMS | TUCBS, onaylı istemci dış IP | Browser GetCapabilities; 45+ sn timeout; transient retry; WMS named-layer eşleme |
| 5 | DOĞALGAZ HATTI | WMS | TUCBS, onaylı istemci dış IP | Browser GetCapabilities; 45+ sn timeout; transient retry; WMS named-layer eşleme |
| 6 | DOĞALGAZ HATTI | WFS | TUCBS, onaylı istemci dış IP | Browser WFS 2.0 GetCapabilities; 45+ sn timeout; transient retry |
| 7 | DOĞALGAZ SERVİS KUTUSU | WFS | TUCBS, onaylı istemci dış IP | Browser WFS 2.0 GetCapabilities; 45+ sn timeout; transient retry |
| 8 | DOĞALGAZ SERVİS KUTUSU | WMS | TUCBS, onaylı istemci dış IP | Browser GetCapabilities; 45+ sn timeout; transient retry; WMS named-layer eşleme |
| 9 | DOĞALGAZ VANA | WFS | TUCBS, onaylı istemci dış IP | Browser WFS 2.0 GetCapabilities; 45+ sn timeout; transient retry |
| 10 | DOĞALGAZ VANA | WMS | TUCBS, onaylı istemci dış IP | Browser GetCapabilities; 45+ sn timeout; transient retry; WMS named-layer eşleme |
| 11 | YAĞMUR SUYU ELEMAN | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 12 | YAĞMUR SUYU BORU | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 13 | PİS SU BORU | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 14 | PİS SU ELEMAN | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 15 | İÇME SUYU ELEMAN | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 16 | İÇME SUYU BORU | MapServer | ABB portal sharing server; render hassas | 30 sn temel timeout; 3 deneme; fresh Layer retry; doğrulanmış 1:400.000 operasyon sınırı |
| 17 | UYGULAMA İMAR PLANI (UIP ESRI3) | MapServer | ABB public ArcGIS server | 30 sn temel timeout; 3 deneme; ilan edilmiş yaklaşık 1:2.311.162–1:1.128 hard scale aralığı |
| 18 | SINIRLAR | FeatureServer | ABB public ArcGIS FeatureServer | 25 sn temel timeout; 2 deneme; vivid sınır renderer; gereksiz hard zoom yok |
| 19 | 3D1234 WFL1 | FeatureServer | ABB public ArcGIS FeatureServer | 25 sn temel timeout; 2 deneme; server query desteği; gereksiz hard zoom yok |
| 20 | 3D1234 WSL2 | SceneServer | ABB public ArcGIS SceneServer | 35 sn temel timeout; 2 deneme; 3B scene metadata; gereksiz hard zoom yok |

## Ortak güvenilirlik kuralları

1. Katman başarılı `load()` tamamlanmadan canlı haritaya eklenmez.
2. Timeout sırasında `cancelLoad()` çağrılır.
3. Retry, başarısız ArcGIS nesnesini yeniden kullanmaz; yeni Layer örneği oluşturur.
4. 401/403, yanlış yapılandırma ve format hataları otomatik tekrar edilmez.
5. Ağ, timeout ve 5xx hataları bounded exponential backoff + deterministic jitter ile tekrar edilir.
6. Ölçülmüş health gecikmesi timeout bütçesine yansır; toplam yükleme timeout'u 60 saniyeyi aşmaz.
7. Çok hata alan servislerde otomatik deneme sayısı düşürülerek sağlayıcının gereksiz yüklenmesi engellenir.
8. TUCBS signed URL'leri repository, health snapshot, scale audit veya hata metinlerine yazılmaz.
9. Public runner TUCBS IP yetkisini doğrulamaz; gerçek doğrulama onaylı istemci tarayıcısından yapılır.
10. Mevcut extent/scale guardrail sistemi layer retry sisteminden bağımsız korunur.

## Neden tüm katmanlar aynı şekilde ele alınmıyor?

WMS/WFS, ArcGIS MapServer, FeatureServer ve SceneServer farklı protokol ve yükleme maliyetlerine sahiptir. Tek bir timeout/retry değeri hızlı servisleri yavaşlatır, ağır servisleri ise erken keser. v16 bu nedenle katman türü ve ölçülmüş gecikmeye göre politika üretir.

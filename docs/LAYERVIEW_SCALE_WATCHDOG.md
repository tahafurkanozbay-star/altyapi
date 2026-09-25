# LayerView Ölçek ve Render Watchdog

Bu katman, v18 katman bazlı zoom kilitleri ve v19 canlı provider metadata uzlaştırmasının üzerinde çalışan son doğrulama katmanıdır. Amaç yalnız servis metadata'sına güvenmek yerine ArcGIS'in **gerçekte oluşturduğu LayerView** durumunu da izlemektir.

## Neden gerekli?

Bir servis `minScale` / `maxScale` değerini doğru ilan etse bile render motoru sınır değerinde kayan nokta, animasyon veya provider yuvarlaması nedeniyle katmanı bir kareliğine ölçek dışında değerlendirebilir. Ayrıca bir Layer başarıyla `load()` olsa bile onun 3B `LayerView` nesnesinin oluşturulması ayrı bir aşamadır.

ArcGIS Maps SDK 5.x Scene component şu sinyalleri sağlar:

- `arcgisViewLayerviewCreate`
- `arcgisViewLayerviewCreateError`
- `arcgisViewLayerviewDestroy`
- `arcgisViewChange`
- `LayerView.visibleAtCurrentScale`

Watchdog yalnız `svc-*` kimlikli proje katmanlarını izler; altlık veya ArcGIS'in dahili katmanlarına müdahale etmez.

## Ölçek düzeltme sırası

1. v18/v19 sayısal zoom guard normal şekilde çalışır.
2. ArcGIS LayerView `visibleAtCurrentScale=false` bildirirse provider katmanı gerçekten ölçek dışındadır.
3. Watchdog o anda **görünür olan** bütün provider ölçek aralıklarının kesişimini çıkarır.
4. Çakışma yoksa tam sınır yerine %4 güvenli iç bölgeye geçilir.
5. Sayısal değer geçerli görünmesine rağmen ArcGIS hâlâ katmanı görünmez sayıyorsa aralığın daha iç bir noktasına gidilir.
6. Aynı ihlal için en fazla iki düzeltme yapılır. Böylece sonsuz zoom salınımı oluşmaz.

## Katman kapanınca

Watchdog hesaplamasına yalnız hem `layer.visible !== false` hem de `layerView.visible !== false` olan katmanlar girer. Katman kapatıldığı anda provider ölçek kısıtı watchdog hesabından çıkar. v18/v19 runtime guard da aynı servis kimliğini aktif listeden kaldırır.

Sonuç: **katman kapalıyken o katmanın zoom sınırı yoktur.**

## Birden fazla katman

Birden fazla ölçeğe duyarlı katman açıksa provider aralıklarının gerçek kesişimi kullanılır:

- uzak zoom sınırı için en dar `minScale`,
- yakın zoom sınırı için en dar `maxScale`.

Aralıklar birbirleriyle imkânsız şekilde çakışıyorsa watchdog yeni bir yapay zoom değeri uydurmaz. Bu durumda v18/v19'un deterministik conflict politikası tek otorite olarak kalır.

## LayerView oluşturma hatası

Layer metadata'sının yüklenmesi ile LayerView'ın 3B sahnede oluşturulması aynı şey değildir. Scene component `arcgisViewLayerviewCreateError` gönderirse watchdog yalnız **geçici** hatalarda aynı Layer nesnesini bir kez haritadan çıkarıp aynı sıra indeksine yeniden ekleyerek LayerView oluşturmayı tekrar dener.

Aşağıdaki kalıcı hata sınıflarında otomatik recycle yapılmaz:

- HTTP 401 / 403,
- authentication / credential / invalid token,
- unsupported spatial reference,
- invalid veya malformed URL.

Böylece yetki sorunları retry döngüsüne sokulmaz ve TUCBS erişim politikası aşılmaya çalışılmaz.

## Güvenlik

Watchdog:

- servis URL'si veya signed TUCBS endpoint'i loglamaz,
- token/credential okumaz,
- yalnız Layer kimliği ve render durumu ile çalışır,
- TUCBS'nin onaylı istemci-IP doğrulamasını değiştirmez.

## Performans

- `arcgisViewChange` denetimi debounce edilir.
- Ölçek düzeltmeleri arasında cooldown vardır.
- Her ihlal için maksimum iki scale repair uygulanır.
- LayerView recycle maksimum bir kez yapılır.
- Sürekli polling veya interval kullanılmaz; sistem event-driven çalışır.

# Başkent 3B CBS · Data Operations Platform v6

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini tek bir modern 3B çalışma alanında yönetir.

## v6 platform yaklaşımı

v6, v5'te tamamlanan native ESM dönüşümünün üzerine veri operasyonu ve gözlemlenebilirlik katmanı ekler. Amaç yalnızca haritayı göstermek değil; servislerin davranışını ölçmek, sorgulanabilir katmanların özniteliklerini incelemek ve operasyon ekibine güvenli bir veri çalışma yüzeyi sağlamaktır.

- ArcGIS çalışma zamanı npm üzerinden **native ESM `@arcgis/core`**
- strict TypeScript 7 ve gerçek ArcGIS SDK tipleri
- servis türüne göre lazy-loaded layer modülleri
- analiz araçlarında dinamik import ve daha düşük başlangıç maliyeti
- FeatureServer / SceneServer için **Öznitelik Veri Atölyesi**
- kayıt limiti, istemci tarafı arama, sütun seçimi ve UTF-8 CSV dışa aktarma
- servis açılış süresi telemetrisi, ortalama ve P95 ölçümleri
- katman kartlarında son ölçüm ve gecikme görünürlüğü
- WebGL2 / CPU / bellek / ağ / DPR / secure-context tanılama merkezi
- güvenli, token içermeyen yerel tanılama raporu
- gelişmiş service worker yaşam döngüsü ve same-origin shell cache
- Node 22 + Node 24 kalite matrisi, CodeQL ve GitHub Pages dağıtımı

## Teknoloji

- **React 19.3**
- **TypeScript 7.0**
- **Vite 8.3**
- **Vitest 5**
- **ArcGIS Maps SDK for JavaScript 5.1 / `@arcgis/core` ESM**
- GitHub Actions — CI, CodeQL ve GitHub Pages
- PWA/service-worker altyapısı

Tarayıcı uygulamasının ana dili bilinçli olarak TypeScript'tir. Projeyi sırf farklı olsun diye daha zayıf bir dile taşımak yerine, TypeScript tarafı gerçek ArcGIS SDK kontratlarıyla sıkılaştırılmıştır. Bu yaklaşım; IDE desteği, refactor güvenliği, tree-shaking, modül bölme ve runtime hata yüzeyini azaltma açısından bu proje için daha uygundur.

## Yerel geliştirme

Bu proje düz HTML uygulaması değildir. VS Code **Live Server** proje kökündeki `.tsx` kaynaklarını derlemez.

```bash
npm install
npm run dev
```

Tarayıcı:

```text
http://127.0.0.1:4173/
```

Üretim önizlemesi:

```bash
npm run build
npm run preview
```

Live Server kullanmak zorundaysanız önce `npm run build` çalıştırın ve yalnızca `dist/` klasörünü servis edin.

## Kalite kapısı

```bash
npm run check
```

Bu komut:

1. servis kataloğu şema / HTTPS / tekrar doğrulaması
2. strict TypeScript derleme kontrolü
3. Vitest regresyon testleri
4. production build
5. `dist/` smoke doğrulaması

çalıştırır.

## Operasyon özellikleri

### 3B sahne

- Ankara merkezli SceneView
- dünya yükseklik modeli
- high / balanced / eco cihaz profilleri
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- katman arama, kurum gruplama, servis türü filtresi ve favoriler
- görünürlük, saydamlık, yakınlaşma ve yeniden bağlanma
- Home, pusula, konum ve tam ekran
- kamera + katman + altlık durumunu URL ile paylaşma
- kamera ve aktif katmanları birlikte saklayan yer imleri
- PNG harita ekran görüntüsü

### Öznitelik Veri Atölyesi

FeatureServer ve SceneServer katmanları salt-okunur olarak sorgulanabilir.

- 50 / 100 / 250 / 500 kayıt limiti
- geometri indirmeden düşük maliyetli öznitelik sorgusu
- servis alan adları ve alias bilgileri
- sütun görünürlüğü seçimi
- yüklenen kayıtlarda gecikmesiz istemci tarafı arama
- Türkçe sayı / boolean gösterimi
- UTF-8 BOM içeren CSV dışa aktarma
- toplam kayıt ile yüklenen kayıt farkını gösteren örnekleme uyarısı

Bu çalışma alanı veri düzenlemez ve sunucuya yazma işlemi yapmaz.

### 3B analiz

- 3B mesafe
- 3B alan
- Daylight
- Slice
- Line of Sight
- Elevation Profile
- Legend
- Basemap Gallery

Araç modülleri ihtiyaç halinde dinamik olarak yüklenir.

### Servis sağlığı

Katman yükleme işlemleri gerçek runtime sonucundan telemetri üretir.

- hazır / yükleniyor / hata / beklemede
- katman açılış süresi
- ortalama servis gecikmesi
- P95 servis gecikmesi
- en yavaş servislerin görünümü
- son başarılı / başarısız ölçüm zamanı
- hatalı servisleri toplu yeniden deneme

### Sistem tanılama

- WebGL2
- CPU logical core sayısı
- tahmini cihaz belleği
- device pixel ratio
- bağlantı tipi ve veri tasarrufu
- color gamut
- secure-context durumu
- performans skoru
- güvenli JSON tanılama raporu

Tanılama raporu servis URL/token değerlerini içermez.

## Kısayollar

- `Ctrl/Cmd + K` — komut paleti
- `L` — katman kataloğu
- `D` — veri atölyesi
- `H` — Ankara başlangıç görünümü
- `F` — tam ekran
- `Esc` — açık araç veya paneli kapat

## Güvenlik

Public istemci bundle'ına gerçek gizli token eklenmez. Token gerektiren WMS/WFS servisleri için sunucu tarafı same-origin proxy / token broker kullanılmalıdır. Servis kimlikleri URL query-string ve token değerlerini DOM, localStorage veya paylaşım bağlantılarına taşımayacak şekilde türetilir.

Öznitelik veri atölyesi de yalnızca katalogda istemciye açılmış servisleri kullanır; kimlik bilgisi veya gizli token üretmez.

Ayrıntılar:

- [SECURITY.md](SECURITY.md)
- [docs/SECURE_SERVICES.md](docs/SECURE_SERVICES.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Mimari

```text
src/
  components/
    DataWorkbench.tsx     salt-okunur öznitelik çalışma alanı
    LayerExplorer.tsx     servis kataloğu
    OperationsPanel.tsx   sağlık / veri / tanılama / yer imi panelleri
  gis/
    ArcGISRuntime.ts      SceneView, sorgu ve operasyon runtime
    layerFactory.ts       lazy ArcGIS / OGC layer adaptörleri
  lib/
    attributeTable.ts     tablo, CSV ve filtre yardımcıları
    serviceMetrics.ts     servis sağlık ve latency ölçümleri
    catalog.ts
    performance.ts
    storage.ts
    urlState.ts
  platform/
    capabilities.ts       cihaz ve tarayıcı tanılama
  styles/
    app.css               responsive command-center tasarım sistemi
tests/
  attributeTable.test.ts
  serviceMetrics.test.ts
  layerFactory.test.ts
  catalog.test.ts
  performance.test.ts
  storage.test.ts
  urlState.test.ts
```

## Sürüm

Current application version: **6.0.0**

MIT lisansı. Harita ve veri servislerinin kendi lisans ve kullanım koşulları ayrıca geçerlidir.

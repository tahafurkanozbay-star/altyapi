# Başkent 3B CBS · Native ESM Command Center v5

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini tek bir modern 3B çalışma alanında yönetir.

## v5 platform dönüşümü

v5 ile proje yalnızca görsel olarak değil, çalışma zamanı mimarisi bakımından da yenilendi. ArcGIS artık `window.$arcgis` ve harici CDN bootstrap'ı üzerinden değil, npm'den gelen **native ESM `@arcgis/core`** modülleri üzerinden tip güvenli ve gerektiğinde dinamik olarak yüklenir.

- `js.arcgis.com` JavaScript bootstrap bağımlılığı kaldırıldı
- ArcGIS sınıfları native ESM modülleriyle yüklenir ve TypeScript doğrudan SDK tiplerini kullanır
- katman adaptörleri servis türüne göre lazy-load edilir
- 3B analiz araçları yalnız açıldıklarında indirilir
- WebGL2, CPU, bellek, ağ, DPR ve güvenli bağlam için **Sistem Tanılama** merkezi eklendi
- kullanıcı tek tıkla gizli URL/token içermeyen yerel tanılama raporu indirebilir
- service worker v5 ile shell cache stratejisi ve güncelleme davranışı güçlendirildi
- CDN global deklarasyonları ve CDN semantiğine özel regresyon kodu kaldırıldı

## Teknoloji

- **React 19.3**
- **TypeScript 7.0** — strict tip güvenliği ve `noUncheckedIndexedAccess`
- **Vite 8.3**
- **Vitest 5**
- **ArcGIS Maps SDK for JavaScript 5.1 / `@arcgis/core` ESM**
- GitHub Actions — Node 22/24 CI, CodeQL ve GitHub Pages
- same-origin PWA/service-worker altyapısı

Tarayıcı uygulamasının ana dili bilinçli olarak TypeScript'tir. Başka bir programlama diline sırf değişiklik olsun diye geçmek yerine, önceki dinamik/global ArcGIS entegrasyonu gerçek ESM modül mimarisine dönüştürülerek daha güçlü derleme zamanı tip güvenliği ve daha az runtime belirsizliği sağlanmıştır.

## Yerel geliştirme

Bu proje statik HTML projesi değildir. VS Code **Live Server** proje kökündeki `.tsx` kaynaklarını derleyemez.

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

Live Server kullanmak zorundaysanız önce `npm run build` çalıştırın ve yalnız `dist/` çıktısını servis edin.

## Kalite kapısı

```bash
npm run check
```

Bu komut servis kataloğu doğrulaması, strict TypeScript, Vitest, production build ve `dist/` smoke doğrulamasını birlikte çalıştırır.

## Başlıca yetenekler

- Ankara merkezli 3B sahne ve dünya yükseklik modeli
- cihaz kapasitesine göre `high / balanced / eco` kalite profilleri
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- katman arama, kurum gruplama, servis türü filtresi ve favoriler
- görünürlük, saydamlık, katmana yaklaşma ve yeniden bağlanma
- canlı servis sağlık paneli
- WebGL2 / cihaz / ağ sistem tanılama merkezi
- 3B mesafe ve alan ölçümü
- Daylight, Slice, Line of Sight ve Elevation Profile
- lejant ve altlık galerisi
- yer/adres arama, Home, pusula, konum ve tam ekran kontrolleri
- harita tıklamasında öznitelik inceleme
- kamera + aktif katman + altlık durumunu URL ile paylaşma
- kamera / katman yer imleri
- `Ctrl/Cmd + K` komut paleti
- PNG harita ekran görüntüsü
- tema, performans ve katman tercihlerinin kalıcı saklanması
- React Error Boundary ve başlangıç tanılama ekranları
- responsive masaüstü / tablet / mobil Command Center arayüzü

## Güvenlik

Public bundle içine gerçek gizli token eklenmez. Token içeren WMS/WFS uçları için sunucu tarafı same-origin proxy/token broker kullanılmalıdır. Servis kimlikleri URL query-string/token değerlerini DOM, localStorage veya paylaşım bağlantılarına taşımayacak şekilde türetilir.

Ayrıntılar: [`SECURITY.md`](SECURITY.md), [`docs/SECURE_SERVICES.md`](docs/SECURE_SERVICES.md), [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Mimari

```text
src/
  components/       React komuta yüzeyleri ve operasyon panelleri
  gis/              typed @arcgis/core ESM runtime + lazy layer factory
  lib/              katalog, performans, URL state, storage
  platform/         tarayıcı / WebGL / cihaz tanılama katmanı
  styles/           Command Center tasarım sistemi
  App.tsx            uygulama orkestrasyonu
public/
  services.json
  manifest.webmanifest
  sw.js
scripts/
  validate-services.mjs
  verify-build.mjs
tests/
  katalog / layer factory / URL state / storage / performans
```

MIT lisansı. Harita ve veri servislerinin kendi lisans ve kullanım koşulları ayrıca geçerlidir.

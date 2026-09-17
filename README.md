# Başkent 3B CBS · Operasyon Platformu v3

Ankara odaklı 3B altyapı/üstyapı koordinasyon uygulaması. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ve OGC (`WMS`, `WFS`) servislerini tek bir modern 3B operasyon arayüzünde yönetir.

## Teknoloji

- **React 19.3** — güncel kararlı React sürümü
- **TypeScript 7.0** — strict tip güvenliği ve `noUncheckedIndexedAccess`
- **Vite 8.3** — Rolldown tabanlı hızlı geliştirme/üretim build'i
- **Vitest 5** — birim testleri
- **ArcGIS Maps SDK for JavaScript 5.1** — güncel kararlı ArcGIS 3B harita motoru
- GitHub Actions — CI, CodeQL ve GitHub Pages
- PWA service worker — yalnız aynı-origin uygulama kabuğu için kontrollü önbellek

ArcGIS 5.1, Esri'nin Eylül 2026 itibarıyla yayınlanmış güncel kararlı sürümüdür. React 19.3 ve TypeScript 7.0 da güncel kararlı sürümlerdir; Vite 8.3'e yükseltilmiştir.

## Önemli: VS Code / Live Server

Bu proje **Vite uygulamasıdır**. Proje kökündeki `index.html` dosyasını Live Server ile doğrudan açmak doğru geliştirme yöntemi değildir; Live Server `.tsx` dosyalarını derlemez ve bare module importlarını çözmez. Bunun sonucu beyaz sayfa olabilir.

Önerilen kullanım:

```bash
npm install
npm run dev
```

Tarayıcı: `http://127.0.0.1:4173/`

Live Server kullanmanız gerekiyorsa:

```bash
npm install
npm run build
```

Ardından **Go Live** kullanın. Depodaki `.vscode/settings.json`, Live Server kökünü `/dist` olarak ayarlar. Ayrıntılar: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Kalite kontrolü

```bash
npm run check
```

Kalite kapısı şunları çalıştırır:

1. `public/services.json` şema/URL doğrulaması
2. strict TypeScript kontrolü
3. Vitest testleri
4. production build
5. build smoke doğrulaması (`dist/index.html` artık `src/main.tsx` referansı taşımamalı; gerekli statik dosyalar ve JS bundle'ları gerçekten mevcut olmalı)

## Başlıca yetenekler

- Ankara merkezli yerel 3B sahne, dünya yükseklik modeli ve cihaz gücüne göre `high / balanced / eco` kalite profili
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- Arama, kurum gruplama, tür filtresi, favoriler, görünürlük ve saydamlık yönetimi
- Katmana yaklaşma, yeniden bağlanma ve servis hata durumu
- 3B mesafe/alan, gün ışığı, kesit, görüş hattı, yükseklik profili, lejant ve altlık galerisi
- Yer/adres arama, Home, pusula, konum ve tam ekran kontrolleri
- Harita tıklamasında öznitelik inceleme
- Servis sağlık paneli
- Kamera + aktif katman + altlık durumunu URL ile paylaşma
- Kamera/katman yer imleri
- `Ctrl/Cmd + K` komut paleti
- PNG harita ekran görüntüsü
- Tema, performans ve katman tercihlerinin kalıcı saklanması
- Responsive masaüstü/tablet/mobil arayüz ve reduced-motion desteği
- React Error Boundary + statik boot tanılama ekranı; derlenmemiş Live Server açılışında artık sessiz beyaz ekran yerine açıklayıcı hata gösterilir

## Güvenlik

Public istemci bundle'ına gerçek gizli token konulmaz. Token içeren WMS/WFS uçları için sunucu tarafı same-origin proxy/token broker kullanılmalıdır. Servis kimlikleri URL query-string/token değerlerini DOM/localStorage/paylaşım linklerine taşımayacak şekilde türetilir.

Ayrıntılar: [`SECURITY.md`](SECURITY.md) ve [`docs/SECURE_SERVICES.md`](docs/SECURE_SERVICES.md).

## Mimari

```text
src/
  components/       React arayüz ve hata sınırı
  gis/              ArcGIS runtime + servis layer factory
  lib/              katalog, performans, URL state, storage
  styles/           responsive tasarım sistemi
  App.tsx            uygulama orkestrasyonu
public/
  services.json
  manifest.webmanifest
  sw.js
scripts/
  validate-services.mjs
  verify-build.mjs
tests/
  catalog / URL state / performans
```

MIT lisansı. Harita ve veri servislerinin kendi lisans/kullanım koşulları ayrıca geçerlidir.

# Başkent 3B CBS · Command Center v4

Ankara odaklı profesyonel 3B altyapı / üstyapı koordinasyon ve CBS operasyon platformu. ArcGIS REST (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC (`WMS`, `WFS`) servislerini tek bir modern 3B çalışma alanında yönetir.

## v4 tasarım yaklaşımı

v4 sürümü yalnızca renk veya tema değişikliği değildir. Arayüz; harita odağını artırmak, operasyon yoğunluğunu azaltmak ve katman/analiz işlerini daha okunabilir hale getirmek için “Command Center” tasarım diline taşındı.

- bağımsız cam yüzeylerden oluşan daha sakin üst komuta barı
- çalışma alanı / navigasyon / 3B analiz / oturum gruplarına ayrılmış sol komuta rayı
- canlı katman özeti, servis sağlık durumları ve toplu katman işlemleri
- koordinat, kamera, ölçek, servis durumu ve GPU profilini gösteren sahne telemetrisi dock'u
- daha güçlü katman kartı hiyerarşisi, veri sahibi ve servis türü bağlamı
- masaüstü, tablet ve mobil için yeniden tasarlanmış responsive davranış
- dark/light tema ve reduced-motion erişilebilirlik desteği

## Teknoloji

- **React 19.3**
- **TypeScript 7.0** — strict tip güvenliği ve `noUncheckedIndexedAccess`
- **Vite 8.3**
- **Vitest 5**
- **ArcGIS Maps SDK for JavaScript 5.1**
- GitHub Actions — CI, CodeQL ve GitHub Pages
- kontrollü same-origin PWA/service-worker altyapısı

Teknoloji yığını sırf farklı görünmek için daha zayıf bir dile veya framework'e taşınmadı. Bu sınıftaki etkileşimli CBS uygulaması için TypeScript + React + Vite mimarisi korunup ürün mimarisi, güvenilirlik ve kullanıcı deneyimi güçlendirildi.

## Yerel geliştirme

Bu proje statik HTML projesi değildir. VS Code **Live Server** proje kökündeki `.tsx` kaynaklarını derleyemez.

Önerilen kullanım:

```bash
npm install
npm run dev
```

Tarayıcı:

```text
http://127.0.0.1:4173/
```

Üretim davranışına yakın önizleme:

```bash
npm run build
npm run preview
```

Live Server kullanmak zorundaysanız önce `npm run build` çalıştırın. Depodaki `.vscode/settings.json` Live Server kökünü `/dist` olarak ayarlar.

## Kalite kapısı

```bash
npm run check
```

Bu komut sırasıyla:

1. `public/services.json` şema / HTTPS / tekrar doğrulaması
2. strict TypeScript kontrolü
3. Vitest testleri
4. production build
5. `dist/` smoke doğrulaması

çalıştırır.

## Başlıca yetenekler

- Ankara merkezli 3B SceneView ve dünya yükseklik modeli
- cihaz kapasitesine göre `high / balanced / eco` kalite profilleri
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- katman arama, kurum gruplama, servis türü filtresi, favoriler
- görünürlük, saydamlık, katmana yaklaşma, yeniden bağlanma
- toplu aktif katman kapatma ve hatalı servisleri tekrar deneme
- canlı servis sağlık paneli
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
- responsive masaüstü / tablet / mobil arayüz

## Güvenlik

Public istemci bundle'ına gerçek gizli token eklenmez. Token içeren WMS/WFS uçları için sunucu tarafı same-origin proxy/token broker kullanılmalıdır. Servis kimlikleri URL query-string/token değerlerini DOM, localStorage veya paylaşım bağlantılarına taşımayacak şekilde türetilir.

Ayrıntılar:

- [`SECURITY.md`](SECURITY.md)
- [`docs/SECURE_SERVICES.md`](docs/SECURE_SERVICES.md)
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

## Mimari

```text
src/
  components/       React arayüz, komuta panelleri ve hata sınırı
  gis/              ArcGIS runtime + servis layer factory
  lib/              katalog, performans, URL state, storage
  styles/           v4 Command Center tasarım sistemi
  App.tsx            uygulama orkestrasyonu
public/
  services.json
  manifest.webmanifest
  sw.js
scripts/
  validate-services.mjs
  verify-build.mjs
tests/
  ArcGIS CDN / katalog / URL state / storage / performans
```

MIT lisansı. Harita ve veri servislerinin kendi lisans ve kullanım koşulları ayrıca geçerlidir.

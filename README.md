# 3B CBS Başkent

Ankara odaklı, modern ve üretime hazır bir **3B Altyapı / Üstyapı Koordinasyon Web Uygulaması**. Proje ArcGIS **FeatureServer, SceneServer, MapServer** servisleriyle OGC **WMS/WFS** servislerini tek bir 3B sahnede birleştirir.

## Teknoloji

- TypeScript 5.9 (strict)
- Native ES Modules
- ArcGIS Maps SDK for JavaScript 5.1
- Framework bağımsız, düşük katmanlı mimari
- GitHub Actions CI + GitHub Pages
- Node tabanlı test ve servis şema doğrulaması

ArcGIS SDK uygulama paketine gömülmez; 5.1 CDN üzerinden gereken modüller dinamik yüklenir. TypeScript modern ES2022 modüllerine derlenir. Böylece uygulama küçük kalır ve CBS katmanları gerektiğinde yüklenir.

## Özellikler

- 3B yerel sahne, dünya yükseklik modeli ve çoklu altlık haritalar
- `public/services.json` servis kataloğunu otomatik okuma
- FeatureServer, SceneServer, MapServer, WMS ve WFS desteği
- Katman arama, kurum bazlı gruplama, görünürlük, saydamlık ve bağlantı durumu
- Katmana yaklaşma, yeniden deneme ve hata raporlama
- 3B mesafe/alan ölçümü, gün ışığı, kesit, görüş hattı, lejant ve altlık galerisi
- Adres/yer arama, Home, pusula ve tam ekran kontrolleri
- Harita tıklamasında öznitelik paneli
- Kamera, altlık ve katman tercihlerinin localStorage'da saklanması
- Kamera + aktif katmanlarla paylaşılabilir URL
- Responsive tasarım, klavye kısayolları ve reduced-motion desteği
- GitHub Pages için otomatik deployment workflow'u

## Kurulum

Node.js 22.12+ gerekir.

```bash
npm install
npm run dev
```

Kalite kontrolü:

```bash
npm run check
```

Üretim derlemesi:

```bash
npm run build
```

Derlenen statik site `dist/` içine yazılır.

## Servis kataloğu

Şema:

```json
{
  "services": [
    {
      "ustKurumAdi": "...",
      "metaveriSahibiKurumAdi": "...",
      "cografiVeriKatmanAdi": "...",
      "servisTuruAdi": "WMS | WFS | MapServer | FeatureServer | SceneServer",
      "tokenUrl": "https://..."
    }
  ]
}
```

> **Güvenlik:** Statik uygulamadaki URL ve tokenlar ziyaretçiler tarafından görülebilir. Uzun ömürlü veya gizli erişim bilgilerini repoya koymayın. Bu depoda kullanıcı tarafından sağlanan token içeren UCBP WMS/WFS URL'leri yayınlanmamıştır. Üretimde güvenli proxy kullanın; ayrıntılar `docs/SECURE_SERVICES.md` dosyasındadır.

## CORS

WMS/WFS ve ArcGIS REST servisleri tarayıcıdan çağrıldığı için hedef servislerin CORS politikasının uygulama origin'ine izin vermesi gerekir. Servis kaynaklı yükleme hataları katman kartında görünür ve yeniden denenebilir.

## GitHub Pages

`.github/workflows/pages.yml` hazırdır. Depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçildiğinde `main` dalına yapılan push sonrası derleme ve dağıtım otomatik çalışır.

## Kısayollar

- `H`: başlangıç görünümü
- `L`: katman paneli
- `F`: tam ekran
- `Esc`: açık analiz aracını kapat

## Mimari

```text
src/
  services/       servis kataloğu + layer factory
  ui/             katman paneli, araç çubuğu, bildirimler
  utils/          DOM ve localStorage yardımcıları
  main.ts         3B sahne ve uygulama orkestrasyonu
public/
  services.json   açık servis kataloğu
scripts/
  validate-services.mjs
.github/workflows/
  ci.yml
  pages.yml
```

Daha ayrıntılı mimari ve operasyon notları `docs/` klasöründedir.

## Lisans

MIT. Harita/veri servislerinin kendi lisans ve kullanım koşulları ayrıca geçerlidir.

# Başkent 3B CBS · Operasyon Platformu v2

Ankara odaklı, modern 3B altyapı/üstyapı koordinasyon uygulaması. Proje ArcGIS REST servisleri (`FeatureServer`, `SceneServer`, `MapServer`) ile OGC `WMS/WFS` katmanlarını tek bir 3B sahnede yönetmek için yeniden yazıldı.

## Teknoloji yığını

- **React 19.3** — bileşen tabanlı, hızlı ve sürdürülebilir kullanıcı arayüzü
- **TypeScript 7** — strict tip güvenliği
- **Vite 8.1 / Rolldown** — modern, hızlı geliştirme ve üretim derlemesi
- **ArcGIS Maps SDK for JavaScript 5.1** — 2B/3B CBS motoru; CDN üzerinden dinamik modül yükleme
- **Vitest 5** — hızlı birim testleri
- GitHub Actions — CI, güvenlik taraması ve GitHub Pages dağıtımı
- PWA shell cache — uygulama kabuğunu hızlandırır; canlı CBS servis yanıtlarını önbelleğe almaz

ArcGIS SDK uygulama bundle'ına gömülmez. CDN üzerinden yalnızca kullanılan harita/layer/widget modülleri dinamik alınır; React uygulaması ayrı ve küçük bir bundle olarak derlenir.

## Başlıca yetenekler

- Yerel 3B sahne, dünya yükseklik modeli, cihaz gücüne göre otomatik `high / balanced / eco` kalite profili
- FeatureServer, SceneServer, MapServer, WMS ve WFS adaptörleri
- Katman kataloğu: kurum bazlı gruplama, canlı arama, tür filtresi, sadece aktif/favori filtreleri
- Katman görünürlüğü, saydamlık, favori, extent'e yaklaşma, hata durumu ve tekrar bağlanma
- Tembel katman oluşturma ve düşük bellekli cihazlarda otomatik layer-cache budama
- 3B mesafe, 3B alan, gün ışığı, kesit, görüş hattı, yükseklik profili, lejant ve altlık galerisi
- Adres/yer arama, Home, pusula, konum ve tam ekran kontrolleri
- Harita tıklamasında öznitelik inceleme paneli
- Servis sağlık merkezi ve hata özeti
- Kamera + aktif katman + altlık durumunu URL ile paylaşma
- Yer imi sistemi: kamera ve açık katmanlar birlikte kaydedilir
- `Ctrl/Cmd + K` komut paleti: katman, panel ve analiz araçlarını tek yerden açma
- PNG harita ekran görüntüsü
- Tema, altlık, performans, kamera, favori, görünürlük ve saydamlık tercihlerinin kalıcı saklanması
- Responsive masaüstü/tablet/mobil arayüz; reduced-motion erişilebilirliği
- PWA manifest + aynı-origin statik shell cache

## Kurulum

Gereksinim: Node.js **22.12+**.

```bash
npm install
npm run dev
```

Kalite kapısı:

```bash
npm run check
```

`check`; servis kataloğunu doğrular, TypeScript strict typecheck çalıştırır, Vitest testlerini yürütür ve üretim build'i oluşturur.

## Servis kataloğu

`public/services.json` yalnızca public depoda yayınlanması güvenli olan servisleri içerir. Kullanıcı tarafından sağlanan ve URL içinde erişim belirteci taşıyan UCBP WMS/WFS uçları public GitHub'a yazılmaz. Bu servisler için `public/services.private.example.json` ve `docs/SECURE_SERVICES.md` şablonu bulunur.

Örnek kayıt:

```json
{
  "ustKurumAdi": "...",
  "metaveriSahibiKurumAdi": "...",
  "cografiVeriKatmanAdi": "...",
  "servisTuruAdi": "WMS | WFS | MapServer | FeatureServer | SceneServer",
  "tokenUrl": "https://..."
}
```

## Performans yaklaşımı

Uygulama cihazın `hardwareConcurrency`, `deviceMemory`, pointer tipi ve `prefers-reduced-motion` bilgisinden otomatik profil seçer. Harita katmanları kullanıcı açana kadar oluşturulmaz. İlk açılıştaki varsayılan katmanlar en fazla iki eşzamanlı istekle yüklenir. Eco profilde kapalı katman cache'i daha agresif temizlenir.

Ayrıntı: `docs/PERFORMANCE.md`.

## GitHub Pages

`.github/workflows/pages.yml` üretim build'ini `dist/` üzerinden yayınlar. Repository'de **Settings → Pages → Source: GitHub Actions** etkin olmalıdır.

## Güvenlik

Statik bir web istemcisinde bulunan URL ve tokenlar kullanıcı tarafından görülebilir. Gerçek gizli anahtarlar hiçbir zaman `services.json`, JavaScript bundle veya GitHub Actions çıktısına konulmamalıdır. Yetkili WMS/WFS servisleri için same-origin backend/proxy önerilir.

Ayrıntılar: `SECURITY.md` ve `docs/SECURE_SERVICES.md`.

## Kısayollar

- `Ctrl/Cmd + K`: Komut paleti
- `L`: Katman paneli
- `H`: Ankara başlangıç görünümü
- `F`: Tam ekran
- `Esc`: Açık analiz aracını veya paneli kapat

## Mimari

```text
src/
  components/      React UI bileşenleri
  gis/             ArcGIS runtime + servis layer factory
  lib/             katalog, performans, URL state, local storage
  styles/          responsive tasarım sistemi
  App.tsx           uygulama orkestrasyonu
public/
  services.json
  sw.js
  manifest.webmanifest
scripts/
  validate-services.mjs
tests/
  catalog / URL state / performans testleri
```

MIT lisansı. Harita/veri servislerinin kendi lisans ve kullanım koşulları ayrıca geçerlidir.

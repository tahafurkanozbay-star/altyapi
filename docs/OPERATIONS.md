# Operasyon ve Yayın Rehberi

## Yerel kalite kapısı

```bash
npm ci
npm run check
```

`check`; servis kataloğu doğrulaması, TypeScript denetimi, testler ve üretim derlemesini birlikte çalıştırır.

## GitHub Pages

1. Repository **Settings → Pages** bölümünde kaynak olarak **GitHub Actions** seçilir.
2. `main` dalına yapılan push ile `.github/workflows/pages.yml` build alır.
3. `dist/` Pages artifact olarak yayınlanır.

## Üretim kontrol listesi

- Tarayıcı konsolunda kritik hata bulunmamalı.
- WMS/WFS ve ArcGIS REST uçlarında CORS doğrulanmalı.
- Gizli erişim anahtarları statik istemciye eklenmemeli.
- Scene/Feature katmanlarında extent ve spatial reference kontrol edilmeli.
- Düşük GPU profilinde adaptif kalite davranışı denenmeli.
- Mobil, tablet ve masaüstü kırılımları kontrol edilmeli.
- PWA/service worker değişikliklerinde cache sürümü artırılmalı.

## Servis arızaları

Uygulama servis hatalarını katman bazında izole eder. Hatalı servis diğer katmanların veya temel 3B sahnenin çalışmasını engellememelidir. Operasyon panelindeki servis sağlık özeti ve katman kartlarındaki durum bilgisi ilk teşhis noktasıdır.

## Geri alma

Yayın sorunu oluşursa GitHub üzerinde son sağlıklı commit'e revert uygulanır. Servis kataloğu değişiklikleri koddan bağımsız tutulduğu için sadece `public/services.json` değişikliği de ayrı geri alınabilir.

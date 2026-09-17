# Yerel geliştirme

Bu proje statik HTML projesi değildir. Kaynak kod React 19.3 + TypeScript 7 + Vite 8 ile derlenir. Bu nedenle `src/main.tsx` dosyasını VS Code **Live Server** doğrudan çalıştıramaz.

## Önerilen geliştirme akışı

```bash
npm install
npm run dev
```

Ardından `http://127.0.0.1:4173/` adresini açın. Vite; TSX dönüşümü, React Fast Refresh, module çözümleme ve doğru asset yollarını sağlar.

VS Code içinde `Terminal → Run Task → CBS: Vite geliştirme sunucusu` görevi de aynı işlemi başlatır.

## Live Server kullanmak zorundaysanız

Önce üretim çıktısını oluşturun:

```bash
npm install
npm run build
```

`.vscode/settings.json` Live Server kökünü `/dist` olarak ayarlar. Bundan sonra **Go Live** ile `dist/index.html` servis edilir. Kaynak dosyada değişiklik yaptıktan sonra build'i yeniden çalıştırmanız gerekir.

> Proje kökünü doğrudan Live Server ile açmak desteklenmez. Tarayıcı TypeScript/TSX ve Vite bare-module importlarını kendi başına derleyemez.

## Kalite kapısı

```bash
npm run check
```

Bu komut servis kataloğunu doğrular, strict TypeScript kontrolünü çalıştırır, Vitest testlerini yürütür, production build üretir ve `dist/` içindeki JavaScript/statik dosya referanslarını doğrular.

## Üretim önizlemesi

```bash
npm run build
npm run preview
```

Bu, GitHub Pages/Vercel/Netlify benzeri statik hosting davranışına geliştirme sunucusundan daha yakındır.

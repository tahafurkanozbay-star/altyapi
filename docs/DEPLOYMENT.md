# Deployment

## GitHub Pages

Depo ayarlarında **Settings → Pages → Source: GitHub Actions** etkinleştirildikten sonra `main` push'ları `.github/workflows/pages.yml` üzerinden otomatik yayınlanır.

## Build

```bash
npm ci
npm run check
```

Üretim çıktısı `dist/` dizinindedir. Statik hosting, CDN veya kurumsal reverse proxy arkasında yayınlanabilir.

## Güvenlik

İstemci bundle'ına gizli token gömülmez. Kimlik doğrulama gerektiren harita servisleri için sunucu tarafı güvenli proxy/token broker kullanılmalıdır.

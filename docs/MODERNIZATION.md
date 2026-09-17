# V2 Modernizasyon Özeti

Bu sürüm uygulamayı framework bağımsız DOM tabanlı yapıdan modern React + TypeScript + Vite mimarisine taşır ve CBS çalışma alanını operasyonel bir ürün kabuğuna dönüştürür.

## Başlıca değişiklikler

- React tabanlı bileşen mimarisi ve strict TypeScript
- ArcGIS çalışma zamanının ayrı servis katmanında yönetilmesi
- Komut paleti ve klavye odaklı hızlı erişim
- Geliştirilmiş katman gezgini, servis sağlık görünümü ve detay paneli
- Adaptif performans profili ve düşük donanım davranışları
- URL durum paylaşımı ve kalıcı kullanıcı tercihleri
- PWA manifest + service worker temeli
- Dependabot ve security workflow
- Genişletilmiş test paketi
- Servis kataloğu için daha sıkı doğrulama

## Tasarım ilkeleri

Arayüz, harita görünürlüğünü koruyan yarı saydam paneller, yüksek kontrastlı operasyon kontrolleri, küçük ekranlarda yeniden akan düzen ve azaltılmış hareket tercihine uyum üzerine kuruludur. Ağır CBS bileşenleri ihtiyaç halinde yüklenir; servis hataları tek katmana izole edilir.

## Güvenlik

Public depo ve GitHub Pages ortamında uzun ömürlü servis tokenları tutulmaz. Kimlik doğrulamalı WMS/WFS bağlantıları için aynı-origin güvenli proxy yaklaşımı kullanılır.

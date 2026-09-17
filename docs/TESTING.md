# Test Stratejisi

`npm run check` tek kalite kapısıdır ve servis kataloğu doğrulaması, TypeScript typecheck, testler ve production build adımlarını çalıştırır.

Test kapsamı şu anda katalog normalizasyonu, Türkçe slug davranışı, URL state serileştirme/okuma ve adaptif performans profilini içerir. ArcGIS servisleri dış ağ bağımlılığı taşıdığı için CI'da servis canlılığı yerine istemci adaptörleri ve katalog sözleşmesi test edilir; canlı uçlar operasyon ortamında ayrıca izlenmelidir.

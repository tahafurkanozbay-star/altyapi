# Quality Gates

Bir değişiklik `main` dalına alınmadan önce servis kataloğu doğrulaması, strict TypeScript typecheck, otomatik testler ve production build başarılı olmalıdır. Güvenlik veya bağımlılık taraması hata verirse sonuç incelenmeden yayın yapılmamalıdır.

# Security Model

Uygulama statik istemci olarak dağıtılabildiğinden tarayıcıya gönderilen hiçbir URL, API anahtarı veya token gizli kabul edilmez. Kimlik doğrulamalı coğrafi servisler için güvenli sunucu tarafı proxy/token broker gerekir.

Önerilen sınırlar: least-privilege servis hesapları, kısa ömürlü token, same-origin proxy, origin kısıtlı CORS, rate limiting, audit log, hassas hata mesajlarını filtreleme ve otomatik bağımlılık taraması.

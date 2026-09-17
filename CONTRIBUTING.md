# Katkı Rehberi

- Node.js 22.12+ kullanın.
- Değişiklikten önce `npm install`, gönderimden önce `npm run check` çalıştırın.
- Harita SDK'sı için `ArcGISRuntime` dışındaki bileşenlerde doğrudan ArcGIS instance yönetmeyin.
- Yeni servis türü eklenirse katalog tipi, `layerFactory`, servis doğrulama scripti ve testleri birlikte güncellenmelidir.
- Ağır 3B katmanları varsayılan olarak açmayın; progressive/lazy load ilkesini koruyun.
- Token veya kurum içi credential commit etmeyin.
- Yeni UI davranışları klavye erişimini ve mobil görünümü bozmayacak şekilde geliştirilmelidir.

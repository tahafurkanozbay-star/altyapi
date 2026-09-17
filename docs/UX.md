# UX ve Erişilebilirlik

Uygulama harita merkezli çalışmayı bozmayacak şekilde katman paneli, araç rayı, komut paleti, detay paneli ve durum çubuğu kullanır.

## Etkileşim

- Katman arama ve servis gruplama
- Klavye kısayolları ve komut paleti
- Harita tıklamasında öznitelik detayı
- Kamera ve aktif katman durumunun paylaşılabilir URL ile taşınması
- Tercihlerin tarayıcıda kalıcı tutulması

## Erişilebilirlik

- Anlamlı `aria-label` kullanımı
- Klavye ile erişilebilir temel kontroller
- `prefers-reduced-motion` uyumu
- Mobil ekranlarda panel yeniden akışı
- Durum ve hata bilgisinin yalnızca renk ile verilmemesi hedefi

## Performans UX'i

Düşük donanım algılandığında görsel kalite kademeli azaltılabilir; amaç etkileşim akıcılığını korumaktır. Ağ servis hataları bütün uygulamayı kilitlemez, ilgili katman durumunda gösterilir.

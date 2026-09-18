# Comfort White Design System

Başkent 3B CBS v7 için görsel sistemin amacı harita üzerinde uzun süre çalışan kullanıcıların gözünü yormadan yüksek bilgi yoğunluğunu korumaktır.

## Renk

Ana tuval `#f4f7f9`, panel yüzeyleri `#ffffff`, ana metin `#183243`, ikincil metin `#647d8e`, vurgu rengi `#1677d2` kullanır. Koyu arka plan veya yüksek parlaklıkta neon vurgu ana tasarım dili değildir.

## Yüzey

Panel, üst bar, araç rayı ve durum dock'u solid beyaza çok yakın tutulur. Blur ve transparan cam efekti yalnız harita ile yüzey arasındaki ayrımı destekleyecek kadar kullanılır. Gölge alfa değerleri düşük tutulur.

## Tipografi

Başlıklar ve katman adları eski sürümlere göre büyütülmüştür. Yardımcı mikro metinler kritik bilgi taşıdığı yerlerde 9–11 px aralığına yükseltilmiştir. Sistem font stack kullanılır; harici font CDN bağımlılığı yoktur.

## Etkileşim

- aktif öğe: açık mavi zemin + ince mavi sınır
- hover: çok hafif gri/mavi yüzey
- focus-visible: 2 px mavi halka
- hata: soluk kırmızı zemin
- başarı: koyu yeşil metin, açık yeşil yüzey
- animasyonlar 180–220 ms aralığında

## Erişilebilirlik

- `prefers-reduced-motion` desteklenir
- `prefers-contrast: more` durumunda sınırlar güçlendirilir ve gölgeler azaltılır
- yalnız renge dayalı durum işaretlerinden kaçınılır
- klavye ile komut paleti ve ana panellere erişim korunur
- mobil yüzeylerde transparanlık azaltılır

## Harita odak modu

`M` tuşu veya üst bardaki göz simgesi sağ panel, detay çekmecesi ve status dock'u geri çekerek 3B sahneye daha fazla alan verir. Tekrar `M` ile operasyon yüzeyi geri gelir.

## ArcGIS Web Components

v7'de kullanıcıya dönük ArcGIS kontrolleri `@arcgis/map-components` kullanır. React 19 custom-element desteği sayesinde ek React wrapper paketine ihtiyaç duyulmaz. Core API yalnız katman, SceneView, kamera ve sorgu gibi düşük seviye yetenekler için kullanılır.

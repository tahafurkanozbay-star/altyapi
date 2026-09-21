/**
 * Katmanları katalogdaki mevcut sıra korunacak şekilde kurum bazında gruplar.
 *
 * Görünürlük, favori, yüklenme durumu veya hata gibi çalışma zamanı alanları
 * sıralamayı ASLA etkilemez. Böylece bir katmanı açıp kapatmak kartın yerini
 * değiştirmez ve operatörün mekânsal hafızası korunur.
 */
export function groupServicesInStableOrder<T extends { organization: string }>(
  services: readonly T[]
): Array<[organization: string, services: T[]]> {
  const groups = new Map<string, T[]>();

  for (const service of services) {
    const current = groups.get(service.organization);
    if (current) current.push(service);
    else groups.set(service.organization, [service]);
  }

  return [...groups.entries()];
}

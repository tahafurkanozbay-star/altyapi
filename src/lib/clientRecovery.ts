export async function clearApplicationCaches(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if ("caches" in window) {
    tasks.push(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("altyapi-")).map((key) => caches.delete(key)))
      )
    );
  }

  if ("serviceWorker" in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        const appBase = new URL("./", window.location.href).pathname;
        return Promise.all(
          registrations
            .filter((registration) => {
              try {
                return new URL(registration.scope).pathname.startsWith(appBase);
              } catch {
                return false;
              }
            })
            .map((registration) => registration.unregister())
        );
      })
    );
  }

  await Promise.allSettled(tasks);
}

export async function clearApplicationCachesAndReload(): Promise<void> {
  await clearApplicationCaches();
  window.location.reload();
}

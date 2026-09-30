# v35 Change Summary

- Layer-load concurrency now uses health-weighted global budget units.
- Fresh degraded, very slow, or repeatedly failing providers are admitted more conservatively.
- High-profile ArcGIS services retain two-per-host concurrency only while health is good.
- WMS/WFS remains serialized per host.
- Startup/share/bookmark restore work prefers healthier queued layers, while interactive and retry ordering is preserved.
- Stale public-runner health is treated as uncertain rather than as a hard negative.
- Browser-local success remains able to restore normal scheduling behavior on later activations.
- No protected TUCBS URL or host-lane state is persisted by the scheduler.

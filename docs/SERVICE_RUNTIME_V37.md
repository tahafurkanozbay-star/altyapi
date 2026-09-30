# Service Runtime v37

v37 makes GIS layer admission react immediately to browser connectivity changes without weakening provider authorization, retry, failover or cancellation rules.

## Offline admission

When the browser explicitly reports `navigator.onLine === false`, the layer scheduler admits **zero new remote layer loads**. Work that is already in flight is not killed merely because the network hint changed; explicit layer hide, retry replacement, runtime disposal and the existing ArcGIS load-cancellation path remain the owners of active cancellation.

Queued operations stay queued and remain cancellable. This avoids spending timeout/retry budgets on requests that cannot leave the device while preserving the user's intent to open the layer when connectivity returns.

## Event-driven resume

The scheduler subscribes locally to:

- `online`
- `offline`
- `visibilitychange`
- Network Information API `change` when the browser exposes it

Every signal only asks the scheduler to re-evaluate its existing queue. There is no polling loop and no connection metadata is persisted or transmitted.

When connectivity returns, queued layer work can start immediately instead of waiting for a new user action or an unrelated running request to complete. Likewise, when Save-Data/effective connection pressure changes, the queue can expand or contract admission for *new* work immediately.

## Admission policy

The normal performance-profile budget remains authoritative when the connection is healthy:

- high: up to 3 weighted units
- balanced: up to 2 weighted units
- eco: 1 weighted unit

Network pressure then caps new admissions:

- offline: 0
- Save-Data, hidden document, 2G, very high RTT or sub-1 Mbps: 1
- 3G or moderately constrained RTT/downlink: at most 2
- healthy connection: normal profile budget

Existing provider-local serialization, health-weighted costs, restore ordering, WMS/WFS failover and in-flight ArcGIS `cancelLoad()` behavior are unchanged.

## Privacy and security boundary

The scheduler only consumes coarse browser-provided hints in memory. It does not persist, log or transmit connection type, RTT, downlink, visibility or online state.

v37 does not bypass IP allowlists, authentication, CORS, TLS, provider scale limits or upstream outages. TUCBS signed endpoints remain browser-local and continue to rely on the user's approved client IP.

## Release delivery

The application release is `37.0.0` and the service-worker shell/data cache generation is v37. Release-coherence tests keep package major and PWA cache generation aligned.

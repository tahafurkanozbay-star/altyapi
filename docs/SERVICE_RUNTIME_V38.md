# Service Runtime v38 — provider-local circuit isolation

v38 keeps the v37 offline-safe, network-aware layer scheduler and adds **in-session provider feedback**. The goal is to prevent one unstable upstream origin from slowing or repeatedly hammering every other operational layer.

## Runtime behavior

- Scheduler lanes remain origin-local (`scheme + host` only). Paths, query strings, TUCBS tokens and credentials are never stored in scheduler health state.
- Two consecutive **network / timeout / HTTP 5xx** outcomes open only that provider lane's circuit.
- Cooldown uses bounded exponential backoff: 4 s, 8 s, 16 s, then at most 24 s.
- After cooldown exactly one **half-open probe** is admitted for that provider. Sibling requests on the same origin wait until the probe resolves.
- A successful half-open request closes the circuit immediately and queued sibling layers continue.
- `401/403`, configuration and response-format failures remain service-specific. They do **not** poison every layer hosted by the same provider.
- When the browser itself is offline, resulting failures are not counted against any provider. v37's global offline queue remains authoritative.
- Explicit user/runtime cancellation is marked before ArcGIS `cancelLoad()`, so an abort caused by hiding/reloading a layer cannot create a false provider outage.
- A provider that succeeds but repeatedly takes at least ~6 s is temporarily limited to one concurrent load even on high-performance devices. Other origins can still use the remaining global budget.
- Circuit state and successful latency samples are **memory-only** and disappear with the page session.

## Why this improves the 20-layer catalog

ABB ArcGIS services, TUCBS OGC services and any other origins do not share the same failure domain. A temporary 5xx/timeout on one origin should not stop independent layers from opening. v38 keeps global device/network pressure controls from v37, while adding provider-local isolation on top.

This is deliberately not an authorization bypass. IP restrictions, tokens and server-side access policy remain authoritative.

## Regression coverage

`tests/providerCircuitBreaker.test.ts` verifies:

1. provider-only isolation after repeated transient failures,
2. unrelated provider progress while a circuit is open,
3. 401/403 isolation from host-level health,
4. one-at-a-time half-open probing and recovery,
5. slow-provider concurrency reduction,
6. explicit cancellation not counting as a provider failure,
7. browser-offline failures not poisoning provider health,
8. bounded circuit cooldowns.

Release generation is `38.0.0` and PWA caches are `v38` so clients do not keep an older scheduler shell after deployment.

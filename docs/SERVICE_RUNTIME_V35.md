# Service Runtime v35 — Health-Aware Load Admission

v35 builds on the v34 host-aware layer scheduler and feeds the freshest safe service-health signals into admission control. The goal is not to skip difficult layers; it is to stop a slow or temporarily degraded provider from being hit with the same parallel request pressure as a healthy provider.

## Admission model

The device performance profile still defines the maximum global budget:

| Profile | Budget units |
| --- | ---: |
| high | 3 |
| balanced | 2 |
| eco | 1 |

Each queued layer load now has a health-weighted cost:

- healthy/normal load: **1** unit
- fresh degraded, very slow, or repeatedly failing load: **2** units on balanced/high profiles
- eco mode always uses **1** unit so no job can become unrunnable

This means a high-end client may still load a risky provider together with one healthy provider, but two risky two-unit loads cannot burst concurrently into separate upstreams. Balanced mode serializes risky loads automatically.

## Per-host protection

WMS/WFS remains strictly one-at-a-time per host. MapServer, FeatureServer and SceneServer may use two concurrent loads per host only on the `high` profile **and only while health rank is good**. Fresh degraded state, very high measured latency, or recent runtime failures reduce that host to one load at a time.

## Health ranking

The scheduler uses only fields already present on the sanitized/runtime `ServiceDefinition`:

- availability (`verified`, `unknown`, `degraded`, `unavailable`)
- browser/public verification latency
- latest browser layer-load latency
- recent failure count
- verification freshness

Stale public-runner evidence is intentionally treated like unknown evidence instead of a hard negative. This matters for ABB/TUCBS-style network-restricted services: a browser-local success can promote the service back to healthy behavior, while an old GitHub-runner timeout cannot permanently throttle it.

## Restore ordering

Priority classes are unchanged:

1. interactive user action
2. explicit retry
3. startup/share/bookmark restore

User actions and retries preserve request order. Only queued **restore** jobs are health-ranked, so known-fast layers become useful first while slower/riskier providers continue loading behind them. No layer is dropped because of health rank.

## Privacy and TUCBS

Host lane identifiers remain memory-only. No URL, hostname, signed TUCBS endpoint, token, credential, or scheduler health state is written to logs, UI events, LocalStorage, public JSON, or workflow artifacts by this scheduler.

## Interaction with existing recovery

v35 is admission control, not a replacement for existing recovery:

1. v35 decides how much concurrent upstream pressure is safe.
2. runtime adaptive timeout/retry and WMS/WFS failover recover an admitted load.
3. provider scale/extent and LayerView watchdogs validate rendering.
4. v33+ atomic/batch activation remains the single camera owner.
5. browser-local health success/failure updates feed future v35 scheduling decisions.

The result is a closed-loop path where real browser outcomes influence later admission without allowing stale public-runner observations to block authorized client access.

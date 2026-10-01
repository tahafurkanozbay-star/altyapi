# Service Runtime v39 — fair, starvation-safe layer admission

v39 builds on v38 provider-local circuit isolation and focuses on one remaining failure mode: a layer can be healthy enough to run yet remain queued too long under sustained user interaction, provider recovery or a live network budget smaller than its static health weight.

## Queue fairness

- Fresh user interactions remain highest priority.
- Retry work waiting at least 15 seconds is promoted to interactive-equivalent scheduling priority.
- Restore work is promoted to retry priority after 12 seconds and interactive-equivalent priority after 30 seconds.
- Once a restore is promoted, FIFO order wins over health ranking so an old degraded provider cannot be postponed forever by newer healthy restores.
- Aging is bounded and memory-only. It changes admission order, not service authorization, retries, URLs or credentials.

## Provider half-open recovery

v38 already allows exactly one request through after a provider circuit cooldown. v39 makes ownership deterministic: the oldest queued sibling on that provider owns the half-open probe. A newer click cannot leapfrog that recovery request on the same origin.

A ready half-open probe receives retry-level scheduling priority, but it does not outrank a fresh interactive request on an unrelated provider. If the probe succeeds, the provider circuit closes and queued siblings resume; if it fails transiently, the existing bounded circuit cooldown continues to apply.

## Constrained-network deadlock prevention

Health-weighted loads can cost two scheduler budget units on balanced/high profiles. Browser network pressure can legitimately reduce the live global budget to one unit (`Save-Data`, 2G, high RTT, low downlink or hidden-page pressure).

Before v39, a two-unit queued load could become unrunnable while the live budget stayed at one. v39 normalizes the admission cost to the current live budget. The risky service therefore runs alone instead of running concurrently or waiting forever. Its configured health cost is unchanged when network capacity is larger.

## Diagnostics

The in-memory scheduler snapshot now exposes only non-sensitive aggregate signals:

- oldest queued wait in milliseconds,
- number of jobs already promoted by aging,
- number of provider circuits open,
- number of active half-open probes,
- number of half-open probes ready to run,
- whether network admission is paused.

No endpoint path, query string, TUCBS token, credential or signed service URL is stored in these diagnostics.

## Regression coverage

`tests/layerLoadSchedulerFairness.test.ts` verifies:

1. bounded retry/restore promotion thresholds,
2. an old restore eventually running before a newer interactive request,
3. a risky two-unit job remaining runnable when live network capacity is one,
4. oldest-sibling ownership of a provider half-open probe,
5. anonymous queue-age diagnostics.

Existing v38 circuit-breaker tests remain authoritative for provider isolation, authorization-error handling, bounded cooldowns, cancellation and slow-provider concurrency reduction.

Release generation is `39.0.0`; PWA shell/data caches are `v39` so clients cannot remain pinned to the v38 scheduler after deployment.

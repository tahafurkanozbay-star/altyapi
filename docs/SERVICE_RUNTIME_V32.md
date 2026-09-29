# Service Runtime v32 — Client-network health precedence

v32 separates **public-runner observability** from **real browser reachability** more explicitly.

## Why

A GitHub-hosted runner and a citizen browser do not necessarily share the same network path. In particular, the six ABB infrastructure MapServer layers can time out from a public runner while remaining reachable from the user's actual network. Treating that runner result as a hard startup block prevents a previously enabled layer from even getting a real browser attempt.

## Trust order

For runtime reachability decisions the application now uses this order:

1. A successful `Layer.load()` in the current browser is direct evidence that the service is reachable and browser-compatible.
2. Approved-IP TUCBS browser verification remains the specialized persistent overlay for protected TUCBS endpoints.
3. A fresh public-runner health snapshot is useful prior evidence, but `degraded + network-restricted` is not a hard circuit breaker for non-TUCBS services.
4. Fresh `server-error`, `browser-blocked`, explicit unavailability, an unconfigured TUCBS sentinel, and an active cooldown remain blocking states.

## Successful browser load

When a layer actually loads in the browser, its in-memory health state is promoted to:

- `availability: verified`
- `access: public-browser`
- `browserCompatible: true`
- measured browser verification latency
- the current verification timestamp
- `verificationStale: false`

This promotion stores no endpoint, token, credential, response body, or other secret. It is runtime-local and uses the existing service definition already needed to render the layer.

## Startup restore

A saved visible non-TUCBS layer whose public-runner result is exactly `degraded + network-restricted` is allowed one real browser activation attempt. Existing adaptive retry and cooldown policies still control repeated failures.

The following conditions are deliberately **not** bypassed:

- active cooldown
- `browser-blocked`
- `server-error`
- fresh explicit `unavailable`
- unconfigured TUCBS runtime sentinel

## TUCBS

v32 does not weaken the approved-IP TUCBS model. TUCBS endpoint persistence and sanitized endpoint-key client health remain handled by the dedicated TUCBS access/health modules. A direct TUCBS layer that successfully loads in the current browser can still become verified for the active runtime, but protected URLs are never copied into health snapshots or logs.

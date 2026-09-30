# v35 Verification Matrix

| Case | Expected admission behavior |
| --- | --- |
| high + verified fast ArcGIS | up to 2 per host, cost 1 |
| high + fresh degraded ArcGIS | 1 per host, cost 2 |
| high + >=8s measured latency | 1 per host, cost 2 |
| balanced + risky provider | cost 2 consumes full global budget |
| eco + any provider health | cost 1; job always remains runnable |
| WMS/WFS any profile | 1 per host |
| stale degraded public-runner result | treated like unknown, not a hard negative |
| interactive vs restore | interactive stays ahead regardless of health rank |
| restore vs restore | healthier known service starts first |
| queued layer closed by user | cancelled before remote Layer.load starts |
| running layer closed by user | runtime desiredVisibility supersedes eventual result |

The automated scheduler tests cover these admission rules without persisting provider host keys or protected TUCBS endpoint data.

import { describe, expect, it } from "vitest";
import {
  MAX_INCIDENTS,
  appendIncident,
  createIncident,
  incidentJournalToJson,
  sanitizeIncidentText
} from "../src/lib/incidentJournal";

describe("incidentJournal", () => {
  it("redacts URLs and long secret-like values", () => {
    const text = sanitizeIncidentText("failed https://example.com/path?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 secret_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890");
    expect(text).not.toContain("https://example.com");
    expect(text).toContain("[url]");
    expect(text).toContain("[redacted]");
  });

  it("creates bounded, sanitized incident entries", () => {
    const incident = createIncident({
      severity: "error",
      kind: "layer-load",
      message: "Servis https://example.com/private yüklenemedi",
      serviceId: "svc a / 1",
      serviceName: "Katman A",
      durationMs: 123.6
    }, new Date("2026-09-21T06:00:00.000Z"));

    expect(incident.message).not.toContain("https://");
    expect(incident.serviceId).toBe("svca1");
    expect(incident.durationMs).toBe(124);
  });

  it("caps the journal and exports a safe JSON envelope", () => {
    let incidents = [];
    for (let index = 0; index < MAX_INCIDENTS + 12; index++) {
      incidents = appendIncident(incidents, createIncident({
        severity: "info",
        kind: "system",
        message: `event-${index}`
      }, new Date(1_700_000_000_000 + index)));
    }
    expect(incidents).toHaveLength(MAX_INCIDENTS);
    const exported = incidentJournalToJson(incidents);
    expect(exported).toContain('"schemaVersion": 1');
    expect(exported).not.toContain("tokenUrl");
  });
});

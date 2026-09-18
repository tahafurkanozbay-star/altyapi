import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v8 architecture guardrails", () => {
  it("does not regress to deprecated ArcGIS widget classes", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    expect(runtime).not.toContain("@arcgis/core/widgets/");
    expect(runtime).toContain("@arcgis/map-components/components/arcgis-search");
    expect(runtime).toContain("@arcgis/map-components/components/arcgis-direct-line-measurement-3d");
  });

  it("ships the comfort-white visual stack as the default", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const storage = await readFile("src/lib/storage.ts", "utf8");
    const comfort = await readFile("src/styles/comfort-white.css", "utf8");

    expect(entry).toContain('@arcgis/core/assets/esri/themes/light/main.css');
    expect(entry).toContain('./styles/comfort-white.css');
    expect(storage).toContain('theme: "light"');
    expect(comfort).toContain("--comfort-white: #ffffff");
  });

  it("ships the query studio and workspace portability layers", async () => {
    const query = await readFile("src/lib/attributeQuery.ts", "utf8");
    const workspace = await readFile("src/lib/workspace.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(query).toContain("buildWhereClause");
    expect(workspace).toContain("parseWorkspaceSnapshot");
    expect(app).toContain("ViewTransition");
  });
});

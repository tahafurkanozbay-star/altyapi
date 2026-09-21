import { describe, expect, it } from "vitest";
import { groupServicesInStableOrder } from "../src/lib/layerOrdering";

type Layer = {
  id: string;
  organization: string;
  visible: boolean;
  favorite: boolean;
};

const catalog: Layer[] = [
  { id: "a", organization: "ABB", visible: false, favorite: false },
  { id: "b", organization: "ABB", visible: false, favorite: true },
  { id: "c", organization: "ABB", visible: true, favorite: false },
  { id: "d", organization: "EPDK", visible: false, favorite: false }
];

describe("stable layer ordering", () => {
  it("preserves catalog order regardless of visibility and favorite state", () => {
    const before = groupServicesInStableOrder(catalog);
    const toggled = catalog.map((layer) =>
      layer.id === "a"
        ? { ...layer, visible: true, favorite: true }
        : layer.id === "c"
          ? { ...layer, visible: false }
          : layer
    );
    const after = groupServicesInStableOrder(toggled);

    expect(before.map(([name, items]) => [name, items.map((item) => item.id)])).toEqual([
      ["ABB", ["a", "b", "c"]],
      ["EPDK", ["d"]]
    ]);
    expect(after.map(([name, items]) => [name, items.map((item) => item.id)])).toEqual([
      ["ABB", ["a", "b", "c"]],
      ["EPDK", ["d"]]
    ]);
  });

  it("does not mutate the input list", () => {
    const ids = catalog.map((layer) => layer.id);
    groupServicesInStableOrder(catalog);
    expect(catalog.map((layer) => layer.id)).toEqual(ids);
  });
});

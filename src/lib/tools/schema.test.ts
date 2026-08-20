import { describe, it, expect } from "vitest";
import { toolsToJsonSchema } from "./schema";
import "./index";

describe("toolsToJsonSchema", () => {
  const schemas = toolsToJsonSchema();

  it("includes every registered SAFE/CONFIRM tool with a name/description/parameters shape", () => {
    expect(schemas.length).toBeGreaterThan(0);
    for (const s of schemas) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.parameters).toBeTypeOf("object");
    }
  });

  it("includes calculator with its expression parameter", () => {
    const calc = schemas.find((s) => s.name === "calculator");
    expect(calc).toBeDefined();
    const props = (calc!.parameters as { properties?: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("expression");
  });

  it("never includes duplicate tool names", () => {
    const names = schemas.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

import { describe, it, expect } from "vitest";
import { evaluateExpression, CalculatorError } from "./calculator";

describe("evaluateExpression", () => {
  it("evaluates basic arithmetic with correct precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("10 / 2 - 1")).toBe(4);
  });

  it("supports exponents (right-associative)", () => {
    expect(evaluateExpression("2 ^ 3")).toBe(8);
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2), not (2^3)^2
  });

  it("supports unary minus and nested parentheses", () => {
    expect(evaluateExpression("-5 + 3")).toBe(-2);
    expect(evaluateExpression("-(2 + 3)")).toBe(-5);
    expect(evaluateExpression("((1 + 2) * (3 + 4))")).toBe(21);
  });

  it("supports decimals", () => {
    expect(evaluateExpression("1.5 + 2.25")).toBe(3.75);
  });

  it("throws on division by zero instead of returning Infinity", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(CalculatorError);
  });

  it("throws on unbalanced parentheses", () => {
    expect(() => evaluateExpression("(1 + 2")).toThrow(CalculatorError);
    expect(() => evaluateExpression("1 + 2)")).toThrow(CalculatorError);
  });

  it("throws on empty input", () => {
    expect(() => evaluateExpression("")).toThrow(CalculatorError);
    expect(() => evaluateExpression("   ")).toThrow(CalculatorError);
  });

  it("rejects any character outside digits/operators/parens/whitespace", () => {
    // This is the actual security property: no identifiers, no function
    // calls, no way to reach global scope — just refuses to tokenize.
    expect(() => evaluateExpression("alert(1)")).toThrow(CalculatorError);
    expect(() => evaluateExpression("process.exit()")).toThrow(CalculatorError);
    expect(() => evaluateExpression("1; console.log('x')")).toThrow(CalculatorError);
    expect(() => evaluateExpression("__proto__")).toThrow(CalculatorError);
    expect(() => evaluateExpression("2+2//comment")).toThrow(CalculatorError);
  });

  it("rejects trailing garbage after a valid expression", () => {
    expect(() => evaluateExpression("2 + 2 2")).toThrow(CalculatorError);
  });

  it("rejects expressions over the length cap", () => {
    expect(() => evaluateExpression("1+".repeat(150))).toThrow(CalculatorError);
  });
});

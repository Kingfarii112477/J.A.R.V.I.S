import { describe, it, expect } from "vitest";
import { isAffirmativeReply, isNegativeReply } from "./affirmDeny";

describe("isAffirmativeReply", () => {
  it("recognizes English affirmatives", () => {
    for (const phrase of ["yes", "Yes.", "proceed", "go ahead", "confirm", "okay", "sure!"]) {
      expect(isAffirmativeReply(phrase)).toBe(true);
    }
  });

  it("recognizes Roman Urdu/Hindi affirmatives", () => {
    for (const phrase of ["haan", "bilkul", "theek hai", "zaroor"]) {
      expect(isAffirmativeReply(phrase)).toBe(true);
    }
  });

  it("recognizes Urdu-script and Hindi-script affirmatives", () => {
    expect(isAffirmativeReply("ہاں")).toBe(true);
    expect(isAffirmativeReply("ٹھیک ہے")).toBe(true);
    expect(isAffirmativeReply("हाँ")).toBe(true);
    expect(isAffirmativeReply("ठीक है")).toBe(true);
  });

  it("does not false-positive on a word that merely starts with an affirmative token", () => {
    expect(isAffirmativeReply("November is next month")).toBe(false);
    expect(isAffirmativeReply("starting the diagnostic")).toBe(false);
    expect(isAffirmativeReply("surely not what I meant")).toBe(false);
  });

  it("rejects negative replies", () => {
    expect(isAffirmativeReply("no")).toBe(false);
    expect(isAffirmativeReply("cancel")).toBe(false);
  });
});

describe("isNegativeReply", () => {
  it("recognizes English negatives", () => {
    for (const phrase of ["no", "No.", "cancel", "stop", "abort", "never mind"]) {
      expect(isNegativeReply(phrase)).toBe(true);
    }
  });

  it("recognizes Roman Urdu/Hindi negatives", () => {
    expect(isNegativeReply("nahi")).toBe(true);
    expect(isNegativeReply("nahin")).toBe(true);
  });

  it("recognizes Urdu-script and Hindi-script negatives", () => {
    expect(isNegativeReply("نہیں")).toBe(true);
    expect(isNegativeReply("नहीं")).toBe(true);
  });

  it("does not false-positive on a word that merely starts with a negative token", () => {
    expect(isNegativeReply("normal operation")).toBe(false);
    expect(isNegativeReply("nohing")).toBe(false);
  });

  it("rejects affirmative replies", () => {
    expect(isNegativeReply("yes")).toBe(false);
    expect(isNegativeReply("proceed")).toBe(false);
  });
});

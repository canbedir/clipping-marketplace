import { describe, expect, it } from "vitest";

import { centsToMoneyInput, parseMoneyToCents } from "@/lib/money";
import { allocatable, earningsForViews, remainingBudget } from "@/lib/payout";

describe("earningsForViews", () => {
  it("pays per completed thousand views and ignores the remainder", () => {
    expect(earningsForViews(999, 250)).toBe(0);
    expect(earningsForViews(1_000, 250)).toBe(250);
    expect(earningsForViews(1_999, 250)).toBe(250);
    expect(earningsForViews(2_000, 250)).toBe(500);
  });

  it("stays exact on rates that would drift in floating point", () => {
    expect(earningsForViews(3_000, 3_333)).toBe(9_999);
    expect(earningsForViews(7_000, 1)).toBe(7);
    expect(Number.isInteger(earningsForViews(123_456, 777))).toBe(true);
  });

  it("refuses negative inputs rather than inventing a payout", () => {
    expect(() => earningsForViews(-1, 250)).toThrow(RangeError);
    expect(() => earningsForViews(1_000, -250)).toThrow(RangeError);
  });
});

describe("budget allocation", () => {
  it("never reports a negative remainder", () => {
    expect(remainingBudget(1_000, 1_500)).toBe(0);
    expect(remainingBudget(1_000, 400)).toBe(600);
  });

  it("caps what a submission can take at what is left", () => {
    expect(allocatable(900, 1_000)).toBe(900);
    expect(allocatable(1_400, 1_000)).toBe(1_000);
    expect(allocatable(-50, 1_000)).toBe(0);
    expect(allocatable(900, 0)).toBe(0);
  });
});

describe("money parsing", () => {
  it("reads admin input as exact cents", () => {
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(parseMoneyToCents("12,5")).toBe(1250);
    expect(parseMoneyToCents("12")).toBe(1200);
    expect(parseMoneyToCents(" 0.07 ")).toBe(7);
  });

  it("does not lose a cent on values that break float arithmetic", () => {
    expect(parseMoneyToCents("1234567.89")).toBe(123_456_789);
    expect(parseMoneyToCents("8.29")).toBe(829);
    expect(parseMoneyToCents("0.29")).toBe(29);
  });

  it("rejects anything that is not a two decimal amount", () => {
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("1e3")).toBeNull();
  });

  it("round trips through the form representation", () => {
    for (const cents of [0, 7, 829, 1250, 123_456_789]) {
      expect(parseMoneyToCents(centsToMoneyInput(cents))).toBe(cents);
    }
  });
});

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getISOTimestamp, getUnixTimestamp } from "../time";

describe("getISOTimestamp", () => {
  test("returns a parseable ISO-8601 string", () => {
    assert.ok(!isNaN(Date.parse(getISOTimestamp())));
  });

  test("ends with Z (UTC)", () => {
    assert.ok(getISOTimestamp().endsWith("Z"));
  });

  test("contains T separator between date and time", () => {
    assert.ok(getISOTimestamp().includes("T"));
  });
});

describe("getUnixTimestamp", () => {
  test("returns an integer", () => {
    assert.ok(Number.isInteger(getUnixTimestamp()));
  });

  test("returns a plausible current timestamp", () => {
    const ts = getUnixTimestamp();
    assert.ok(ts > 1_580_000_000, "should be after Jan 2020");
    assert.ok(ts < 2_000_000_000, "should be before 2033");
  });

  test("is within 2 seconds of Date.now()", () => {
    const ts = getUnixTimestamp();
    const now = Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(ts - now) <= 2);
  });
});

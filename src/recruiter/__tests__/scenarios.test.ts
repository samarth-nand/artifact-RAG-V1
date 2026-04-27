import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  GenerateScenariosRequestSchema,
  RubricDimensionSchema,
  ScenarioTypeEnum,
} from "../scenarios.zod";

describe("GenerateScenariosRequestSchema", () => {
  test("applies defaults when called with an empty object", () => {
    const result = GenerateScenariosRequestSchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data?.count, 4);
    assert.equal(result.data?.force, false);
  });

  test("rejects count above 10", () => {
    assert.ok(!GenerateScenariosRequestSchema.safeParse({ count: 11 }).success);
  });

  test("rejects count below 1", () => {
    assert.ok(!GenerateScenariosRequestSchema.safeParse({ count: 0 }).success);
  });

  test("accepts valid custom values", () => {
    const result = GenerateScenariosRequestSchema.safeParse({
      count: 3,
      force: true,
      types: ["behavioral", "technical"],
    });
    assert.ok(result.success);
    assert.equal(result.data?.count, 3);
    assert.equal(result.data?.force, true);
  });
});

describe("ScenarioTypeEnum", () => {
  test("accepts all four valid types", () => {
    for (const type of ["case_interview", "behavioral", "situational", "technical"]) {
      assert.ok(
        ScenarioTypeEnum.safeParse(type).success,
        `'${type}' should be valid`
      );
    }
  });

  test("rejects unknown types", () => {
    assert.ok(!ScenarioTypeEnum.safeParse("roleplay").success);
    assert.ok(!ScenarioTypeEnum.safeParse("").success);
  });
});

describe("RubricDimensionSchema", () => {
  const validDimension = {
    name: "Structured Thinking",
    weight: 0.4,
    description: "Ability to break down problems",
    scoringGuide: {
      poor: "No structure",
      adequate: "Some structure",
      strong: "Clear structure",
      exceptional: "MECE, exhaustive structure",
    },
  };

  test("accepts a valid rubric dimension", () => {
    assert.ok(RubricDimensionSchema.safeParse(validDimension).success);
  });

  test("rejects weight above 1", () => {
    assert.ok(
      !RubricDimensionSchema.safeParse({ ...validDimension, weight: 1.5 }).success
    );
  });

  test("rejects weight below 0", () => {
    assert.ok(
      !RubricDimensionSchema.safeParse({ ...validDimension, weight: -0.1 }).success
    );
  });

  test("rejects incomplete scoringGuide", () => {
    assert.ok(
      !RubricDimensionSchema.safeParse({
        ...validDimension,
        scoringGuide: { poor: "a", adequate: "b" },
      }).success
    );
  });
});

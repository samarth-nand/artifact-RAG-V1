import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ClarityGradeRequestSchema,
  CreateSessionRequestSchema,
  DimensionScoreSchema,
  GradeResultSchema,
} from "../zod";

describe("DimensionScoreSchema", () => {
  test("accepts a full object", () => {
    const result = DimensionScoreSchema.safeParse({
      score: 75,
      out_of: 100,
      rationale: "Good",
      evidence_from_transcript: ["candidate mentioned X"],
      citations: [],
    });
    assert.ok(result.success);
    assert.equal(result.data?.score, 75);
  });

  test("coerces a bare number into the full schema", () => {
    const result = DimensionScoreSchema.safeParse(85);
    assert.ok(result.success);
    assert.equal(result.data?.score, 85);
    assert.equal(result.data?.out_of, 100);
  });

  test("rejects score above 100", () => {
    const result = DimensionScoreSchema.safeParse({
      score: 110,
      out_of: 100,
      rationale: "",
      evidence_from_transcript: [],
      citations: [],
    });
    assert.ok(!result.success);
  });

  test("rejects score below 0", () => {
    const result = DimensionScoreSchema.safeParse({
      score: -5,
      out_of: 100,
      rationale: "",
      evidence_from_transcript: [],
      citations: [],
    });
    assert.ok(!result.success);
  });
});

describe("GradeResultSchema", () => {
  test("accepts a valid result and fills defaults", () => {
    const result = GradeResultSchema.safeParse({
      overall_score: 80,
      dimension_scores: {
        Clarity: {
          score: 75,
          out_of: 100,
          rationale: "Clear framing",
          evidence_from_transcript: [],
          citations: [],
        },
      },
    });
    assert.ok(result.success);
    assert.deepEqual(result.data?.strengths, []);
    assert.deepEqual(result.data?.improvements, []);
    assert.equal(result.data?.is_test_attempt, false);
  });

  test("rejects overall_score above 100", () => {
    assert.ok(
      !GradeResultSchema.safeParse({ overall_score: 105, dimension_scores: {} })
        .success
    );
  });

  test("rejects overall_score below 0", () => {
    assert.ok(
      !GradeResultSchema.safeParse({ overall_score: -1, dimension_scores: {} })
        .success
    );
  });
});

describe("CreateSessionRequestSchema", () => {
  test("applies defaults for mode and userId", () => {
    const result = CreateSessionRequestSchema.safeParse({ questionId: "q_001" });
    assert.ok(result.success);
    assert.equal(result.data?.mode, "pm");
    assert.equal(result.data?.userId, "anonymous");
  });

  test("accepts all valid mode values", () => {
    for (const mode of ["pm", "consulting", "pm_mock", "technical", "behavioral"]) {
      assert.ok(
        CreateSessionRequestSchema.safeParse({ questionId: "q1", mode }).success,
        `mode '${mode}' should be valid`
      );
    }
  });

  test("rejects an invalid mode", () => {
    assert.ok(
      !CreateSessionRequestSchema.safeParse({ questionId: "q1", mode: "invalid" })
        .success
    );
  });

  test("rejects missing questionId", () => {
    assert.ok(!CreateSessionRequestSchema.safeParse({ mode: "pm" }).success);
  });
});

describe("ClarityGradeRequestSchema", () => {
  test("rejects an empty questions array", () => {
    assert.ok(!ClarityGradeRequestSchema.safeParse({ questions: [] }).success);
  });

  test("accepts a valid request", () => {
    const result = ClarityGradeRequestSchema.safeParse({
      questions: [{ text: "What is the target market?" }],
    });
    assert.ok(result.success);
  });
});

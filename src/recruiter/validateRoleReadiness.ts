import { sql } from "drizzle-orm";
import { getDb } from "../db/index";
import { logger } from "../shared/logger";

/**
 * Role data loaded from the DB — all fields from the 4-step intake flow
 * plus the joined company record.
 */
export interface RoleData {
  id: string;
  recruiterId: string;

  // Step 1 — JD
  jdRaw: string;
  title: string;
  level: string;

  // Step 2 — Team & Company
  teamContext: { teamName: string; isNewProduct: boolean } | string;
  productType: string;
  techStack: string[];
  companyName: string;
  companyWebsite: string | null;
  companyIndustry: string;
  companyDescription: string | null;

  // Step 3 — AI Understanding
  aiSummary: string;
  aiPriorities: string[];

  // Step 4 — Follow-ups
  constraints: string;
  failureReasons: string;
  decisionAuthority: string;
  stakeholderPushback: string;
  hardestRelationship: string;
  productStability: string;
  dailyProblems: string;
  struggleReasons: string;
  unacceptableMistake: string;
  successCriteria: string;
  pmType: string;
}

const STEP_REQUIRED_FIELDS: Record<string, (keyof RoleData)[]> = {
  "Step 1 (Job Description)": ["jdRaw", "title", "level"],
  "Step 2 (Team & Company)": ["teamContext", "productType", "companyName", "companyIndustry"],
  "Step 3 (AI Summary)": ["aiSummary", "aiPriorities"],
  "Step 4 (Role Context)": [
    "constraints",
    "failureReasons",
    "decisionAuthority",
    "stakeholderPushback",
    "hardestRelationship",
    "productStability",
    "dailyProblems",
    "struggleReasons",
    "unacceptableMistake",
    "successCriteria",
    "pmType",
  ],
};

export interface ValidationResult {
  valid: boolean;
  missingSteps: string[];
  missingFields: string[];
}

/**
 * Load a role by ID (with company JOIN) and validate that all 4 intake
 * steps have been completed.
 */
export async function loadAndValidateRole(
  roleId: string
): Promise<{ role: RoleData | null; validation: ValidationResult }> {
  const db = getDb();

  const rows: any[] = await db.execute(sql`
    SELECT
      r.id,
      r.recruiter_id        AS "recruiterId",
      r.jd_raw              AS "jdRaw",
      r.title,
      r.level,
      r.team_context        AS "teamContext",
      r.product_type        AS "productType",
      r.tech_stack          AS "techStack",
      r.ai_summary          AS "aiSummary",
      r.ai_priorities       AS "aiPriorities",
      r.constraints,
      r.failure_reasons     AS "failureReasons",
      r.decision_authority  AS "decisionAuthority",
      r.stakeholder_pushback AS "stakeholderPushback",
      r.hardest_relationship AS "hardestRelationship",
      r.product_stability   AS "productStability",
      r.daily_problems      AS "dailyProblems",
      r.struggle_reasons    AS "struggleReasons",
      r.unacceptable_mistake AS "unacceptableMistake",
      r.success_criteria    AS "successCriteria",
      r.pm_type             AS "pmType",
      c.name                AS "companyName",
      c.website             AS "companyWebsite",
      c.industry            AS "companyIndustry",
      c.description         AS "companyDescription"
    FROM roles r
    LEFT JOIN companies c ON r.company_id = c.id
    WHERE r.id = ${roleId}
    LIMIT 1
  `);

  if (rows.length === 0) {
    return {
      role: null,
      validation: { valid: false, missingSteps: [], missingFields: [] },
    };
  }

  const role = rows[0] as RoleData;

  // Validate completeness across all 4 steps
  const missingSteps: string[] = [];
  const missingFields: string[] = [];

  for (const [stepName, fields] of Object.entries(STEP_REQUIRED_FIELDS)) {
    const stepMissing: string[] = [];
    for (const field of fields) {
      const value = role[field];
      if (value === null || value === undefined || value === "") {
        stepMissing.push(field);
      } else if (Array.isArray(value) && value.length === 0) {
        stepMissing.push(field);
      }
    }
    if (stepMissing.length > 0) {
      missingSteps.push(stepName);
      missingFields.push(...stepMissing);
    }
  }

  logger.debug("Role readiness validation", {
    roleId,
    valid: missingSteps.length === 0,
    missingSteps,
  });

  return {
    role,
    validation: {
      valid: missingSteps.length === 0,
      missingSteps,
      missingFields,
    },
  };
}

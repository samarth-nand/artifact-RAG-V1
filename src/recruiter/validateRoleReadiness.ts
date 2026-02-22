import { getTursoClient } from "../db/turso";
import { logger } from "../shared/logger";

/**
 * Role data loaded from the Turso DB — all fields from the 4-step intake flow
 * plus the joined company record.
 *
 * JSON columns (team_context, tech_stack, ai_priorities) are parsed from TEXT.
 * IDs are integers (SQLite), coerced to strings for the API layer.
 */
export interface RoleData {
  id: string;
  recruiterId: string;
  createdBy: string | null;

  // Step 1 — JD
  jdRaw: string | null;
  title: string | null;
  level: string | null;

  // Step 2 — Team & Company
  teamContext: { teamName: string; isNewProduct: boolean } | string | null;
  productType: string | null;
  techStack: string[];
  companyName: string | null;
  companyWebsite: string | null;
  companyIndustry: string | null;
  companyDescription: string | null;

  // Step 3 — AI Understanding
  aiSummary: string | null;
  aiPriorities: string[];

  // Step 4 — Follow-ups
  constraints: string | null;
  failureReasons: string | null;
  decisionAuthority: string | null;
  stakeholderPushback: string | null;
  hardestRelationship: string | null;
  productStability: string | null;
  dailyProblems: string | null;
  struggleReasons: string | null;
  unacceptableMistake: string | null;
  successCriteria: string | null;
  pmType: string | null;
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
 * Safely parse a JSON TEXT column. Returns the parsed value or the original
 * string if parsing fails.
 */
function safeJsonParse(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Load a role by ID (with company JOIN) from Turso/SQLite and validate
 * that all 4 intake steps have been completed.
 */
export async function loadAndValidateRole(
  roleId: string
): Promise<{ role: RoleData | null; validation: ValidationResult }> {
  const turso = getTursoClient();

  let rows;
  try {
    const result = await turso.execute({
      sql: `
        SELECT
          r.id,
          r.recruiter_id,
          r.created_by,
          r.jd_raw,
          r.title,
          r.level,
          r.team_context,
          r.product_type,
          r.tech_stack,
          r.ai_summary,
          r.ai_priorities,
          r.constraints,
          r.failure_reasons,
          r.decision_authority,
          r.stakeholder_pushback,
          r.hardest_relationship,
          r.product_stability,
          r.daily_problems,
          r.struggle_reasons,
          r.unacceptable_mistake,
          r.success_criteria,
          r.pm_type,
          c.name   AS company_name,
          c.website AS company_website,
          c.industry AS company_industry,
          c.description AS company_description
        FROM roles r
        LEFT JOIN companies c ON r.company_id = c.id
        WHERE r.id = ?
        LIMIT 1
      `,
      args: [roleId],
    });
    rows = result.rows;
  } catch (error) {
    logger.error("Failed to query role from Turso", { roleId, error });
    throw new Error("Failed to load role data");
  }

  if (rows.length === 0) {
    return {
      role: null,
      validation: { valid: false, missingSteps: [], missingFields: [] },
    };
  }

  const row = rows[0];

  // Map SQLite row to RoleData, parsing JSON TEXT columns
  const role: RoleData = {
    id: String(row.id),
    recruiterId: row.recruiter_id as string,
    createdBy: (row.created_by as string) ?? null,
    jdRaw: row.jd_raw as string,
    title: row.title as string,
    level: row.level as string,
    teamContext: safeJsonParse(row.team_context),
    productType: row.product_type as string,
    techStack: safeJsonParse(row.tech_stack) ?? [],
    aiSummary: row.ai_summary as string,
    aiPriorities: safeJsonParse(row.ai_priorities) ?? [],
    constraints: row.constraints as string,
    failureReasons: row.failure_reasons as string,
    decisionAuthority: row.decision_authority as string,
    stakeholderPushback: row.stakeholder_pushback as string,
    hardestRelationship: row.hardest_relationship as string,
    productStability: row.product_stability as string,
    dailyProblems: row.daily_problems as string,
    struggleReasons: row.struggle_reasons as string,
    unacceptableMistake: row.unacceptable_mistake as string,
    successCriteria: row.success_criteria as string,
    pmType: row.pm_type as string,
    companyName: row.company_name as string,
    companyWebsite: (row.company_website as string) ?? null,
    companyIndustry: row.company_industry as string,
    companyDescription: (row.company_description as string) ?? null,
  };

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

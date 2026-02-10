import { getTursoClient } from "./turso";
import { logger } from "../shared/logger";

/**
 * Fetch a role from Turso with its associated company
 * Handles JSON parsing for text columns
 */
export async function getRoleWithCompany(roleId: number) {
  const turso = getTursoClient();

  try {
    const result = await turso.execute({
      sql: `
        SELECT 
          r.id,
          r.recruiter_id AS recruiterId,
          r.company_id AS companyId,
          r.jd_raw AS jdRaw,
          r.title,
          r.level,
          r.team_context AS teamContext,
          r.product_type AS productType,
          r.tech_stack AS techStack,
          r.ai_summary AS aiSummary,
          r.ai_priorities AS aiPriorities,
          r.constraints,
          r.failure_reasons AS failureReasons,
          r.decision_authority AS decisionAuthority,
          r.stakeholder_pushback AS stakeholderPushback,
          r.hardest_relationship AS hardestRelationship,
          r.product_stability AS productStability,
          r.daily_problems AS dailyProblems,
          r.struggle_reasons AS struggleReasons,
          r.unacceptable_mistake AS unacceptableMistake,
          r.success_criteria AS successCriteria,
          r.pm_type AS pmType,
          r.status,
          r.created_at AS createdAt,
          r.updated_at AS updatedAt,
          c.id AS company_id,
          c.name AS companyName,
          c.website,
          c.industry,
          c.description
        FROM roles r
        LEFT JOIN companies c ON r.company_id = c.id
        WHERE r.id = ?
        LIMIT 1
      `,
      args: [roleId],
    });

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Parse JSON text columns
    const parseJson = (val: any) => {
      if (!val) return null;
      try {
        return typeof val === "string" ? JSON.parse(val) : val;
      } catch {
        logger.warn("Failed to parse JSON column", { value: val });
        return null;
      }
    };

    return {
      id: row.id,
      recruiterId: row.recruiterId,
      companyId: row.companyId,
      company: row.company_id
        ? {
            id: row.company_id,
            name: row.companyName,
            website: row.website,
            industry: row.industry,
            description: row.description,
          }
        : null,
      jdRaw: row.jdRaw,
      title: row.title,
      level: row.level,
      teamContext: parseJson(row.teamContext),
      productType: row.productType,
      techStack: parseJson(row.techStack),
      aiSummary: row.aiSummary,
      aiPriorities: parseJson(row.aiPriorities),
      constraints: parseJson(row.constraints),
      failureReasons: parseJson(row.failureReasons),
      decisionAuthority: row.decisionAuthority,
      stakeholderPushback: row.stakeholderPushback,
      hardestRelationship: row.hardestRelationship,
      productStability: row.productStability,
      dailyProblems: row.dailyProblems,
      struggleReasons: parseJson(row.struggleReasons),
      unacceptableMistake: row.unacceptableMistake,
      successCriteria: row.successCriteria,
      pmType: row.pmType,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    logger.error("Failed to fetch role from Turso", { roleId, error });
    throw error;
  }
}

/**
 * Check if a role has all required fields filled (intake complete)
 */
export function isRoleComplete(role: Awaited<ReturnType<typeof getRoleWithCompany>>) {
  if (!role) return false;

  const requiredFields = [
    "title",
    "level",
    "teamContext",
    "techStack",
    "aiSummary",
    "decisionAuthority",
    "productStability",
    "dailyProblems",
    "successCriteria",
  ];

  return requiredFields.every((field) => {
    const value = role[field as keyof typeof role];
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object" && value !== null) return Object.keys(value).length > 0;
    return !!value;
  });
}

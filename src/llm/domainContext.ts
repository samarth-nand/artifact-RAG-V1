export const domainContext: Record<string, string> = {
  product_management: `
DOMAIN GROUNDING — PRODUCT MANAGEMENT
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- Problem framing & scoping
- User empathy & insight quality
- Prioritization & tradeoff reasoning
- Metrics definition & success measurement
- Stakeholder communication

Strong candidate signals:
- Asks clarifying questions before proposing solutions
- Distinguishes between user needs and feature requests
- Quantifies impact when prioritizing (e.g. "this affects 40% of DAU")
- Defines both leading and lagging success metrics
- Acknowledges tradeoffs explicitly rather than picking one answer confidently
- Defends prioritization decisions with reasoning when pushed back on

Weak candidate signals:
- Jumps straight to solution without framing the problem first
- Prioritizes based on personal opinion rather than data or framework
- Defines success only as revenue or a single vanity metric
- Cannot explain why they would deprioritize something
- Treats all users as one homogeneous group

Red flags:
- Proposes building everything with no prioritization rationale
- Cannot define what success looks like for the feature or initiative
- Ignores technical or resource feasibility entirely
- Immediately changes their answer when lightly pushed rather than defending with reasoning
`,

  consulting: `
DOMAIN GROUNDING — CONSULTING / CASE INTERVIEW
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- Structured problem decomposition
- Hypothesis-driven reasoning
- Quantitative comfort & estimation
- Insight quality & so-what thinking
- Communication clarity & synthesis

Strong candidate signals:
- Opens with a clear framework before solving — does not start answering immediately
- States hypotheses explicitly before analyzing ("I would expect the issue is X because...")
- Does mental math out loud and sanity checks estimates against intuition
- Moves from data to insight ("this tells us that...") rather than just restating what was given
- Closes with a clear recommendation, not just a summary of findings
- Adapts framework when given new or unexpected information mid-case

Weak candidate signals:
- Applies a generic framework (e.g. Porter's Five Forces) without tailoring it to the specific problem
- Gets lost in analysis without surfacing a point of view or recommendation
- Avoids or fumbles basic mental math when estimation is required
- Describes what the data shows but does not say what to do about it
- Loses structure mid-case and reverts to conversational rambling

Red flags:
- Cannot decompose the problem into components — responds purely conversationally with no structure
- Makes a recommendation with no supporting logic or data
- Panics when given unexpected information and completely abandons their framework
- Cannot do basic estimation such as market sizing or back-of-envelope cost math
`,

  accounting: `
DOMAIN GROUNDING — ACCOUNTING
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- Technical accuracy (accrual vs cash, period-end treatment, debits/credits)
- Reconciliation methodology
- Compliance & audit judgment
- Communication under pressure
- Process thinking & controls design

Strong candidate signals:
- Correctly distinguishes revenue recognition from cash receipt — knows a deposit is not earned revenue
- Sequences reconciliation correctly: adjusts book balance first, then bank balance, documents exceptions
- Identifies in-transit items and timing differences separately from actual posting errors
- Pushes back on unsupported journal entries even under deadline pressure from leadership
- Proposes both a short-term manual workaround and a longer-term process or systems fix
- Understands audit trail requirements and documents steps for reviewability
- Knows when to escalate vs when to resolve independently

Weak candidate signals:
- Treats a bank deposit as equivalent to earned revenue in the same period
- Cannot explain why AR, cash, and revenue might not reconcile at month-end
- Accepts a plug entry to meet a deadline without flagging the compliance risk
- Focuses only on finding the error but does not document steps for audit trail
- Proposes fixes that require system or engineering changes when told that is not available this month
- Cannot explain cutoff concepts or why timing differences exist

Red flags:
- Agrees to book unsupported revenue adjustments solely to hit a deadline
- Cannot explain basic reconciliation sequencing or cutoff treatment
- Blames other teams (BOMs, bank, IT) without proposing any coordination plan or interim control
- No awareness of segregation of duties, audit trail requirements, or compliance implications
`,

  engineering: `
DOMAIN GROUNDING — SOFTWARE ENGINEERING
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- System design & architecture reasoning
- Scalability & performance awareness
- Code quality & maintainability thinking
- Debugging & root cause analysis
- Technical communication & tradeoff articulation

Strong candidate signals:
- Starts with requirements clarification before jumping into design
- Considers scale (users, data volume, throughput) when making architecture decisions
- Identifies single points of failure and proposes mitigation strategies
- Discusses tradeoffs between approaches rather than presenting one as obviously correct
- Considers operational concerns (monitoring, deployment, rollback)
- Mentions testing strategy and how to verify the solution works

Weak candidate signals:
- Jumps straight to implementation without understanding requirements or constraints
- Designs for the happy path only — does not consider failure modes or edge cases
- Cannot articulate why they chose one approach over another
- Ignores scalability and only designs for current load
- Does not consider data consistency, race conditions, or concurrency issues

Red flags:
- Cannot explain basic system design concepts (load balancing, caching, database indexing)
- Proposes a monolithic solution for a clearly distributed problem without justification
- No awareness of operational requirements (monitoring, alerting, deployment)
- Cannot reason about performance characteristics of their proposed solution
`,

  sales: `
DOMAIN GROUNDING — SALES
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- Discovery & needs identification
- Value articulation & positioning
- Objection handling & negotiation
- Pipeline management & deal qualification
- Relationship building & stakeholder mapping

Strong candidate signals:
- Asks discovery questions before pitching — understands the buyer's pain points first
- Tailors value proposition to the specific buyer's context, not a generic pitch
- Handles objections by acknowledging the concern, then reframing with evidence
- Qualifies deals rigorously — knows when to walk away from a bad-fit prospect
- Maps decision-making units (champion, economic buyer, blocker) and plans accordingly
- Uses specific metrics or case studies to support claims

Weak candidate signals:
- Leads with product features instead of buyer outcomes
- Responds to objections defensively rather than with curiosity
- Cannot articulate the difference between a prospect and a qualified opportunity
- Has no process for multi-threading or managing complex stakeholder dynamics
- Relies on discounting as the primary negotiation lever

Red flags:
- Cannot describe their sales process or methodology
- Makes up numbers or references when challenged on claims
- Shows no awareness of buyer psychology or decision-making dynamics
- Cannot explain why a deal was lost or what they would do differently
`,

  marketing: `
DOMAIN GROUNDING — MARKETING
When generating rubric dimensions and scoring guides, use these as your foundation.

Core dimensions to include (pick 3-5 most relevant to the scenario):
- Audience segmentation & targeting
- Channel strategy & budget allocation
- Messaging & positioning clarity
- Measurement & attribution thinking
- Campaign planning & execution

Strong candidate signals:
- Segments audience before selecting channels — does not start with tactics
- Connects marketing activities to business outcomes (pipeline, revenue, retention)
- Considers the full funnel (awareness → consideration → conversion → retention)
- Uses data to inform decisions but does not over-index on one metric
- Understands attribution challenges and proposes realistic measurement approaches
- Balances brand building with performance marketing

Weak candidate signals:
- Starts with tactics (run ads, post on social) without strategy or audience definition
- Cannot connect marketing spend to business outcomes
- Focuses only on top-of-funnel awareness without consideration of conversion
- Uses vanity metrics (impressions, likes) as primary success measures
- Cannot explain how they would test or optimize a campaign

Red flags:
- No understanding of unit economics or customer acquisition cost
- Cannot differentiate messaging for different audience segments
- Proposes a strategy with no measurement plan
- Shows no awareness of brand vs performance marketing tradeoffs
`,
};

/**
 * Resolve a role's domain context based on available role data.
 * Uses title, pmType, and companyIndustry to find the best match.
 */
export function getDomainContext(
  title: string | null,
  pmType: string | null,
  companyIndustry: string | null
): string {
  // Build a searchable string from all available signals
  const signals = [title, pmType, companyIndustry]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!signals) return "";

  // Check for domain matches in priority order (most specific first)
  const matchers: Array<{ keywords: string[]; domain: string }> = [
    {
      keywords: ["account", "accounting", "accountant", "finance", "financial", "bookkeep", "audit", "tax", "controller", "cpa"],
      domain: "accounting",
    },
    {
      keywords: ["product manager", "product management", "pm ", "product lead", "product owner"],
      domain: "product_management",
    },
    {
      keywords: ["consult", "case interview", "strategy", "management consult", "advisory"],
      domain: "consulting",
    },
    {
      keywords: ["engineer", "developer", "software", "sre", "devops", "backend", "frontend", "fullstack", "full-stack", "swe"],
      domain: "engineering",
    },
    {
      keywords: ["sales", "account executive", "business development", "bdr", "sdr", "revenue"],
      domain: "sales",
    },
    {
      keywords: ["marketing", "growth", "demand gen", "content", "brand", "digital marketing", "performance marketing"],
      domain: "marketing",
    },
  ];

  for (const { keywords, domain } of matchers) {
    if (keywords.some((kw) => signals.includes(kw))) {
      return domainContext[domain] ?? "";
    }
  }

  return "";
}

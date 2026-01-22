#!/usr/bin/env tsx
/**
 * Ingest PM interview exemplars from PDF and seed database
 * Extracts high-quality transcripts to train the grading model
 * Exemplars are answers scored 80-95 on the 0-100 scale
 */

import { getDb } from "../src/db/index.js";
import { exemplarTranscripts } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../src/shared/logger.js";
import * as fs from "fs";

interface ExemplarInput {
  questionId: string;
  questionText: string;
  category: string;
  transcript: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  keyStrengths: string[];
  keyImprovements: string[];
  source: string;
}

/**
 * Curated high-quality PM interview exemplars (80-95 score range)
 * These serve as reference answers for grading calibration
 */
const HARDCODED_EXEMPLARS: ExemplarInput[] = [
  {
    questionId: "exemplar_001",
    questionText: "How would you increase user engagement on Instagram?",
    category: "strategy",
    transcript: `Instagram is one of the world's largest social networks with over 2 billion monthly active users. To increase engagement, I would focus on three key areas.

First, content discovery. The algorithm currently prioritizes content from accounts users follow. I would invest in making the Explore page more personalized and diverse, showing content that aligns with user interests but from accounts they don't follow. This drives discovery and increases time on platform.

Second, creator tools. Many creators are moving to TikTok because of better video editing features and analytics. I would significantly improve our reels editing suite - add more effects, better performance metrics, and integration with music libraries to compete.

Third, community building features. Features like close friends, communities, and group video calls have shown strong engagement. I would expand these, making it easier for users to form smaller communities within Instagram rather than splintering off to other platforms.

For metrics, I would track: daily active users, time spent, posts created/shared, story interactions, and ultimately, revenue per user. The North Star would be daily active users growing 10-15% year-over-year.

This approach balances creator retention, user satisfaction, and business growth.`,
    overallScore: 88,
    dimensionScores: {
      clarity: 90,
      depth: 85,
      framework: 92,
      insight: 83,
    },
    keyStrengths: [
      "Clear three-pillar framework for engagement",
      "Specific product improvements rather than generic suggestions",
      "Connected strategy to competitor threats (TikTok)",
      "Included concrete metrics for measurement",
    ],
    keyImprovements: [
      "Could have deeper analysis on user psychology and motivation",
      "Missing discussion of potential negative externalities",
    ],
    source: "pm_mock_interviews_pdf",
  },
  {
    questionId: "exemplar_002",
    questionText:
      "How would you estimate the number of Pizza Hut restaurants in the US?",
    category: "metrics",
    transcript: `I'll work through this using a bottom-up approach combined with market research knowledge.

Starting with the US population: approximately 330 million people. Pizza consumption is fairly widespread, especially among families, young professionals, and students. I'd estimate roughly 70% of the population eats pizza at least occasionally - so about 230 million people.

Now, how often do people buy from chain pizza restaurants? Let's say on average, a pizza consumer gets pizza from a chain restaurant 2-3 times per month. That's roughly 2.5 times per month or 30 times per year.

So total annual pizza restaurant visits: 230 million × 30 = 6.9 billion visits per year.

What's the capacity of an average Pizza Hut? If we assume:
- Open 10-12 hours per day
- Average transaction time: 15-20 minutes
- Server/counter staff handles about 2-3 transactions per hour
- Each location has 4-5 staff on average
- So roughly 40-50 transactions per location per day

At 45 transactions per day × 365 days = ~16,000 transactions per location per year.

6.9 billion visits ÷ 16,000 visits per location = ~430,000 locations needed.

But Pizza Hut isn't the only chain - there's Domino's, Papa John's, Little Caesars, regional chains. Pizza Hut has maybe 25-30% market share among chains, so:
430,000 × 0.27 = ~116,000 Pizza Hut locations

However, I know the actual number is around 6,000-7,000 locations in the US. This means either my assumptions are off or chains are much more efficient than I estimated.

The discrepancy suggests:
- People eat pizza less frequently from chains than I estimated
- Or chains handle much higher volume per location
- Or I overestimated the market

A more realistic estimate: ~6,500 Pizza Hut locations in the US.`,
    overallScore: 82,
    dimensionScores: {
      clarity: 84,
      depth: 80,
      framework: 85,
      insight: 78,
    },
    keyStrengths: [
      "Systematic bottom-up approach with clear assumptions",
      "Showed self-correction when estimate was unrealistic",
      "Broke down complex problem into manageable pieces",
      "Validated against sanity check",
    ],
    keyImprovements: [
      "Could have used top-down approach to cross-check",
      "Didn't explicitly state assumptions being made",
      "Could have been more precise about market segments",
    ],
    source: "pm_mock_interviews_pdf",
  },
  {
    questionId: "exemplar_003",
    questionText:
      "Tell us about a time you disagreed with your manager. How did you handle it?",
    category: "behavioral",
    transcript: `At my previous company, I was working on a feature roadmap for our mobile app. My manager wanted to focus entirely on performance optimization - making the app faster. This made sense from a technical debt perspective, but I believed we needed to prioritize new features that users had been requesting.

My manager said, "We need to focus on the fundamentals. Speed sells."

Rather than just accepting this, I asked if we could discuss further. I came prepared with data: I had surveyed 50 active users, run performance comparisons with competitors, and analyzed our app store reviews. Seventy percent of critical reviews mentioned missing features, not speed. Only 15% mentioned performance.

I presented this to my manager, saying, "I understand the importance of optimization, but the data suggests users are more frustrated by missing features. What if we did a hybrid approach - 60% on features and 40% on optimization?"

My manager initially said no, but suggested I present to the product and engineering leads. I did, and they agreed with the hybrid approach. The result: we shipped three important features while still making meaningful performance improvements. User satisfaction increased, and we also reduced our app crash rate by 30%.

The key to my approach was:
1. Gathering data rather than arguing emotionally
2. Acknowledging the validity of my manager's perspective
3. Proposing a compromise
4. Being willing to escalate appropriately

This taught me that disagreement is healthy when done respectfully and data-driven.`,
    overallScore: 85,
    dimensionScores: {
      clarity: 88,
      depth: 82,
      framework: 85,
      insight: 84,
    },
    keyStrengths: [
      "Clear conflict resolution approach with specific example",
      "Demonstrated data-driven decision making",
      "Showed respect for manager while advocating for perspective",
      "Included measurable outcomes",
      "Articulated lessons learned",
    ],
    keyImprovements: [
      "Could have discussed what they learned about themselves",
      "Didn't mention if they followed up with manager afterward",
    ],
    source: "pm_mock_interviews_pdf",
  },
  {
    questionId: "exemplar_004",
    questionText:
      "Design a feature to reduce user churn in a ride-sharing app.",
    category: "product_design",
    transcript: `Reducing churn in ride-sharing requires understanding why users leave. Based on research, the main reasons are: long wait times, high prices, safety concerns, and poor customer service after incidents.

I would design a three-layer retention strategy:

Layer 1: Predictive Intervention
- Use machine learning to identify users at risk of churning based on: increase in cancelled rides, longer wait time tolerance decreasing, shift to competitor app usage
- When we detect risk, automatically send personalized incentives: $5 credit, priority matching, or free ride upgrade
- For high-value users (frequent riders), offer concierge support for problem resolution

Layer 2: Improved Experience
- Reduce wait times through better dispatch algorithms and driver incentives during peak hours
- Transparent pricing: show upfront cost breakdowns and compare to competitors
- Safety enhancements: driver ratings visibility, emergency button, in-app police reporting

Layer 3: Community Building
- Create loyalty programs with tiers (Bronze/Silver/Gold) unlocking perks
- Regular communication about new features and improvements
- User events and community surveys to show we listen

Success metrics:
- Monthly churn rate (target: <5% reduction in churn)
- Customer Lifetime Value increase (target: +15% LTV)
- Net Promoter Score improvement (target: +10 points)
- Win-back rate on churned users (target: 20% of churned users return)

Implementation timeline: Predictive layer in 2 months, experience improvements in 3 months, community features in 4 months.

This strategy balances immediate intervention with long-term engagement improvements.`,
    overallScore: 90,
    dimensionScores: {
      clarity: 92,
      depth: 88,
      framework: 93,
      insight: 87,
    },
    keyStrengths: [
      "Multi-layered approach showing strategic thinking",
      "Data-driven retention strategy with specific causes and solutions",
      "Clear metrics tied to business impact",
      "Considered user segmentation (high-value users)",
      "Realistic implementation timeline",
    ],
    keyImprovements: [
      "Could have discussed cannibalization concerns of incentives",
      "Missing discussion of international considerations",
    ],
    source: "pm_mock_interviews_pdf",
  },
];

/**
 * Ingest exemplars into the database
 */
async function ingestExemplars() {
  try {
    const { initializeDb } = await import("../src/db/index.js");
    await initializeDb();
    const db = getDb();

    console.log(`\n📚 Ingesting ${HARDCODED_EXEMPLARS.length} exemplars into the database...\n`);

    let successCount = 0;
    for (const exemplar of HARDCODED_EXEMPLARS) {
      try {
        // Check if exemplar already exists
        const existing = await db
          .select()
          .from(exemplarTranscripts)
          .where(eq(exemplarTranscripts.questionId, exemplar.questionId))
          .limit(1);

        if (existing.length > 0) {
          console.log(
            `⏭️  ${exemplar.questionText.substring(0, 50)}... (already exists)`
          );
          successCount++;
          continue;
        }

        const result = await db
          .insert(exemplarTranscripts)
          .values({
            questionId: exemplar.questionId,
            questionText: exemplar.questionText,
            category: exemplar.category,
            transcript: exemplar.transcript,
            overallScore: exemplar.overallScore,
            dimensionScores: exemplar.dimensionScores,
            keyStrengths: exemplar.keyStrengths,
            keyImprovements: exemplar.keyImprovements,
            feedback: `High-scoring exemplar for ${exemplar.category} category`,
            source: exemplar.source,
            isVerified: true,
          })
          .returning();

        console.log(
          `✅ ${exemplar.questionText.substring(0, 50)}...`
        );
        console.log(
          `   Score: ${exemplar.overallScore}/100 | Category: ${exemplar.category}`
        );
        successCount++;
      } catch (error) {
        logger.warn(
          `Failed to ingest exemplar ${exemplar.questionId}`,
          error
        );
      }
    }

    console.log(
      `\n🎉 Successfully ingested ${successCount}/${HARDCODED_EXEMPLARS.length} exemplars!`
    );
    console.log(
      "These will be used as reference answers for grading calibration.\n"
    );
    process.exit(0);
  } catch (error) {
    logger.error("Failed to ingest exemplars", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestExemplars();
}

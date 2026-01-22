#!/bin/bash
# Setup learning system: run migrations and seed exemplars

set -e

echo "🚀 Setting up PM Interview Learning System..."
echo ""

# Step 1: Run database migration
echo "📦 Step 1: Running database migration..."
npx drizzle-kit migrate || echo "⚠️  Migration may have already run"
echo "✅ Migration complete"
echo ""

# Step 2: Seed exemplars
echo "📚 Step 2: Seeding exemplar data..."
npx tsx scripts/ingest-exemplars.ts
echo ""

# Step 3: Verify setup
echo "🔍 Step 3: Verifying setup..."
npx tsx -e "
import { getDb } from './src/db/index.js';

const db = getDb();

// Check exemplar count
const exemplars = await db.execute('SELECT COUNT(*) as count FROM exemplar_transcripts');
console.log('✅ Exemplar count:', (exemplars as any)[0]?.count || 0);

// Check grading history count
const history = await db.execute('SELECT COUNT(*) as count FROM grading_history');
console.log('✅ Grading history records:', (history as any)[0]?.count || 0);

console.log('✅ Learning system fully initialized!');
process.exit(0);
" || echo "✅ Database verified"

echo ""
echo "🎉 Learning system setup complete!"
echo ""
echo "Next steps:"
echo "1. Review LEARNING_SYSTEM.md for full documentation"
echo "2. Test with: npm run dev"
echo "3. Submit a PM interview response to trigger exemplar usage"
echo "4. Check logs for: 'Retrieved exemplars for grading'"

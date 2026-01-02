#!/bin/bash

# LOCAL TESTING GUIDE FOR ARTIFACT-GRADER
# This script walks through the complete local testing workflow

set -e

echo "🚀 Artifact-Grader Local Testing Setup"
echo "======================================="
echo ""

# Step 1: Install Dependencies
echo "📦 Step 1: Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi
echo ""

# Step 2: Check Environment
echo "🔧 Step 2: Checking environment setup..."
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit .env with your actual credentials:"
    echo "   - DATABASE_URL: Your Postgres/Neon connection string"
    echo "   - OPENAI_API_KEY: Your OpenAI API key"
    echo ""
    echo "Run: nano .env  (or your preferred editor)"
    exit 1
else
    echo "✅ .env file found"
fi
echo ""

# Step 3: TypeScript Check
echo "🔍 Step 3: TypeScript type checking..."
npm run typecheck
echo "✅ TypeScript check passed"
echo ""

# Step 4: Build
echo "🏗️  Step 4: Building TypeScript..."
npm run build
echo "✅ Build successful"
echo ""

# Step 5: Database Setup
echo "💾 Step 5: Database setup..."
echo "⚠️  Make sure your Postgres database exists and pgvector extension is enabled:"
echo ""
echo "   psql <your_database_url> -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
echo ""
echo "Ready to push schema? (y/n)"
read -r response
if [[ "$response" == "y" ]]; then
    npm run db:push
    echo "✅ Database schema pushed"
else
    echo "⏭️  Skipping database schema push"
fi
echo ""

echo "======================================="
echo "✅ Local testing setup complete!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1️⃣  In Terminal 1 - Start the dev server:"
echo "    npm run dev"
echo ""
echo "2️⃣  In Terminal 2 - Test the API (see commands below)"
echo ""
echo "📚 Testing commands:"
echo ""
echo "--- Create an attempt ---"
echo "curl -X POST http://localhost:3000/attempts \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"userId\":\"test-user\",\"questionId\":\"pm_case_001\"}'"
echo ""
echo "--- Get attempt status ---"
echo "curl http://localhost:3000/attempts/{attemptId}"
echo ""
echo "--- Process attempt (after uploading audio) ---"
echo "curl -X POST http://localhost:3000/attempts/{attemptId}/process"
echo ""
echo "📖 For more details, see TESTING.md"
echo "======================================="

#!/bin/bash

# Run database migrations for structure sprint
# Usage: ./run-migrations.sh

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable not set"
  exit 1
fi

echo "Running structure sprint migrations..."
psql "$DATABASE_URL" < src/db/migrations/0003_structure_sprint.sql

echo "Seeding default scenarios..."
psql "$DATABASE_URL" < src/db/seeds/structure_scenarios.sql

echo "✓ Migrations complete"
psql "$DATABASE_URL" -c "SELECT id, question_type, prompt FROM structure_scenarios LIMIT 5;"

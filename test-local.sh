#!/bin/bash

# Simple test helper for artifact-grader
# This script provides quick test commands

API_URL="${1:-http://localhost:3000}"
COMMAND="${2:-help}"

print_help() {
    cat << 'EOF'
Local Testing Commands for artifact-grader

Usage: ./test-local.sh [API_URL] [COMMAND]

Commands:
  help              Show this help message
  create-attempt    Create a new attempt
  list-questions    List available questions
  
Examples:
  ./test-local.sh                    # Use default http://localhost:3000
  ./test-local.sh http://localhost:3000 create-attempt
EOF
}

create_attempt() {
    echo "Creating attempt..."
    echo ""
    curl -s -X POST "$API_URL/attempts" \
      -H "Content-Type: application/json" \
      -d '{
        "userId": "test-user-'$(date +%s)'",
        "questionId": "pm_case_001"
      }' | jq .
    echo ""
}

list_questions() {
    echo "Available Questions:"
    echo ""
    cat << 'EOF'
1. pm_case_001 - "How would you approach improving user retention for a mobile app?"
2. pm_case_002 - "Describe your experience owning a feature from ideation through launch"
3. pm_case_003 - "Design a feature to help users discover relevant content"

Use questionId in create-attempt command
EOF
}

# Parse commands
case "$COMMAND" in
  help)
    print_help
    ;;
  create-attempt)
    create_attempt
    ;;
  list-questions)
    list_questions
    ;;
  *)
    echo "❌ Unknown command: $COMMAND"
    echo ""
    print_help
    ;;
esac

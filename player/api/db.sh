#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Create it with CLUSTER_ARN, SECRET_ARN, etc." >&2
  exit 1
fi

source "$ENV_FILE"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 \"SQL statement\"" >&2
  echo "       $0 --file path/to/file.sql" >&2
  exit 1
fi

run_sql() {
  aws rds-data execute-statement \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --resource-arn "$CLUSTER_ARN" \
    --secret-arn "$SECRET_ARN" \
    --database "$DATABASE_NAME" \
    --include-result-metadata \
    --sql "$1" \
    --output json
}

if [[ "$1" == "--file" ]]; then
  if [[ $# -lt 2 ]]; then
    echo "Error: --file requires a path argument" >&2
    exit 1
  fi
  FILE_PATH="$2"
  if [[ ! -f "$FILE_PATH" ]]; then
    echo "Error: file not found: $FILE_PATH" >&2
    exit 1
  fi
  while IFS= read -r stmt; do
    [[ -z "$stmt" ]] && continue
    echo ">>> $stmt"
    run_sql "$stmt"
    echo ""
  done < <(sed 's/--.*$//' "$FILE_PATH" | tr '\n' ' ' | sed 's/;/;\n/g' | sed 's/^[[:space:]]*//' | grep -v '^$')
else
  run_sql "$1"
fi

#!/usr/bin/env bash
# Compare rule-based vs Gemma PET selection on a few scenarios.
set -u
cd "$(dirname "$0")"
run() { npx tsx src/run.ts "$1" 2>&1 | grep -vE "^@@result"; }
score() { grep -E "^privacy" "out/$DATASET/$SCENARIO/scorecard_run.log" | head -1; }

for pair in "health HEALTH-S1" "customer_service CS-S1" "finance FIN-S1"; do
  set -- $pair
  export DATASET=$1 SCENARIO=$2
  echo "=== $DATASET / $SCENARIO ==="
  run detect | grep -E "Gemma|labelled"
  for mode in 0 1; do
    export GEMMA_SELECT=$mode
    start=$(date +%s)
    run select | grep -E "Gemma|decisions"
    run transform > /dev/null
    run demonstrate > /dev/null
    echo "GEMMA_SELECT=$mode ($(( $(date +%s) - start ))s): $(score)"
    cp "out/$DATASET/$SCENARIO/pet_plan.csv" "out/$DATASET/$SCENARIO/pet_plan.gemma$mode.csv"
  done
done

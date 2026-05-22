#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

rm -f targetable-feedback.zip
zip -rq targetable-feedback.zip targetable-feedback

echo "Built targetable-feedback.zip"
unzip -l targetable-feedback.zip

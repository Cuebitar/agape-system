#!/usr/bin/env bash
# Deploy to Cloud Run behind Firebase Hosting. Run once: firebase login --reauth && gcloud auth login
# Usage: PROJECT_ID=agape-offering ./deploy.sh
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
REGION=asia-southeast1
gcloud run deploy agape-system --project "$PROJECT_ID" --region "$REGION" --source . \
  --allow-unauthenticated --max-instances 3 \
  --set-env-vars "NODE_ENV=production,DATABASE_SSL=true,TRUST_PROXY=2" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,ADMIN_PASSWORD=ADMIN_PASSWORD:latest,SESSION_SECRET=SESSION_SECRET:latest"
npx -y firebase-tools@latest deploy --only hosting --project "$PROJECT_ID"

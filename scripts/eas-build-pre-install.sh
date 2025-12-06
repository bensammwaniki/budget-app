#!/usr/bin/env bash

set -e

echo "🔧 Setting up google-services.json..."

# Check if GOOGLE_SERVICES_JSON environment variable is set
if [ -z "$GOOGLE_SERVICES_JSON" ]; then
  echo "⚠️  GOOGLE_SERVICES_JSON environment variable is not set"
  echo "ℹ️  Checking if google-services.json already exists..."
  
  if [ -f "google-services.json" ]; then
    echo "✅ google-services.json already exists, using existing file"
    exit 0
  else
    echo "❌ Error: google-services.json not found and GOOGLE_SERVICES_JSON env var not set"
    exit 1
  fi
fi

# Decode and write google-services.json
echo "$GOOGLE_SERVICES_JSON" | base64 --decode > google-services.json

echo "✅ google-services.json created successfully from environment variable"

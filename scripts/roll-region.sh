#!/bin/bash

# Fly.io App Region Rotation Script
# This script rotates the app through different regions to distribute load

set -e  # Exit on any error

APP_NAME="yt-dlp-api"

# Check if flyctl is authenticated
if ! flyctl auth whoami &> /dev/null; then
  echo "Error: flyctl is not authenticated. Please run 'flyctl auth login' or set FLY_API_TOKEN environment variable"
  exit 1
fi

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
  echo "Error: flyctl is not installed or not in PATH"
  exit 1
fi

echo "Starting region rotation for $APP_NAME..."

OLD_REGION=$(flyctl regions list | grep 'Regions \[app\]:' | awk '{print $3}')

# Ordered list of regions
REGIONS=("lax" "sjc" "dfw" "ord" "ewr" "iad")

# Check if REGIONS is empty
if [ ${#REGIONS[@]} -eq 0 ]; then
  echo "No regions defined. Exiting."
  exit 1
fi

# If OLD_REGION is empty, bring up a machine in the first region
if [ -z "$OLD_REGION" ]; then
  echo "No old region found. Bringing up a machine in the first region: ${REGIONS[0]}"
  flyctl scale count --region ${REGIONS[0]} 1 --yes
  exit 0
fi

echo "Current region: $OLD_REGION"

# Find the next region
NEW_REGION=""
for i in "${!REGIONS[@]}"; do
  if [[ "${REGIONS[$i]}" == "$OLD_REGION" ]]; then
    NEW_REGION=${REGIONS[$(( (i + 1) % ${#REGIONS[@]} ))]}
    break
  fi
done

# Check if NEW_REGION is empty or the same as OLD_REGION
if [ -z "$NEW_REGION" ] || [ "$NEW_REGION" == "$OLD_REGION" ]; then
  echo "No new region found or it's the same as the old region. Exiting."
  exit 1
fi

echo "Switching from $OLD_REGION to $NEW_REGION"

# Scale the new region to 1
echo "Scaling up new region: $NEW_REGION"
flyctl scale count --region $NEW_REGION 1 --yes

# Wait for the new region to be ready (optional, add more robust logic as needed)
echo "Waiting 60 seconds for new region to be ready..."
sleep 60

# Scale the old region to 0
echo "Scaling down old region: $OLD_REGION"
flyctl scale count --region $OLD_REGION 0 --yes

echo "Region rotation complete: $OLD_REGION -> $NEW_REGION"

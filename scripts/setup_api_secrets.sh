#!/bin/bash

# Create a secret for the API token
echo "Validating API_TOKEN per https://hono.dev/docs/middleware/builtin/bearer-auth"

if [[ ! "$API_TOKEN" =~ ^[A-Za-z0-9._~+/-]+=*$ ]]; then
  echo "Error: API_TOKEN does not match the required pattern of /[A-Za-z0-9._~+/-]+=*/!" >&2
  exit 1
fi
echo "Now setting up API_TOKEN..."
wrangler secret put API_TOKEN

#!/bin/bash
echo -n "Enter API_TOKEN: "
read -r API_TOKEN

echo "Validating API_TOKEN per https://hono.dev/docs/middleware/builtin/bearer-auth"
# Validate against the regex
if [[ ! "$API_TOKEN" =~ ^[A-Za-z0-9._~+/-]+=*$ ]]; then
  echo "Error: API_TOKEN does not match the required pattern of /[A-Za-z0-9._~+/-]+=*/!" >&2
  exit 1
fi

echo "Now setting up API_TOKEN as a Wrangler secret..."
# Pipe the validated value to wrangler
echo "$API_TOKEN" | wrangler secret put API_TOKEN
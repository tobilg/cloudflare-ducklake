#!/bin/bash

# Create a secret for the R2 token
echo "Now setting up R2_TOKEN..."
wrangler secret put R2_TOKEN

# Create a secret for the R2 endpoint
echo "Now setting up R2_ENDPOINT..."
wrangler secret put R2_ENDPOINT

# Create a secret for the R2 catalog
echo "Now setting up R2_CATALOG..."
wrangler secret put R2_CATALOG

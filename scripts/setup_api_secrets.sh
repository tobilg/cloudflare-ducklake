#!/bin/bash

# Create a secret for the API token
echo "Now setting up API_TOKEN..."
wrangler secret put API_TOKEN

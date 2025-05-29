#!/bin/bash

# Create a secret for the R2 bucket name
echo "Now setting up R2_BUCKET..."
wrangler secret put R2_BUCKET

# Create a secret for the R2 access key ID
echo "Now setting up R2_ACCESS_KEY_ID..."
wrangler secret put R2_ACCESS_KEY_ID

# Create a secret for the R2 secret access key
echo "Now setting up R2_SECRET_ACCESS_KEY..."
wrangler secret put R2_SECRET_ACCESS_KEY

# Create a secret for the R2 account ID
echo "Now setting up R2_ACCOUNT_ID..."
wrangler secret put R2_ACCOUNT_ID

# Create a secret for the Postgres user
echo "Now setting up POSTGRES_USER..."
wrangler secret put POSTGRES_USER

# Create a secret for the Postgres password
echo "Now setting up POSTGRES_PASSWORD..."
wrangler secret put POSTGRES_PASSWORD

# Create a secret for the Postgres host
echo "Now setting up POSTGRES_HOST..."
wrangler secret put POSTGRES_HOST

# Create a secret for the Postgres database
echo "Now setting up POSTGRES_DB..."
wrangler secret put POSTGRES_DB

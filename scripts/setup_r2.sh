#!/bin/bash

# Create a bucket
wrangler r2 bucket create $1
echo "R2_BUCKET=$1" >> .dev.vars

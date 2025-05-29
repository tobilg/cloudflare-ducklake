#!/bin/bash

# Create a bucket
wrangler r2 bucket create $1

# Enable catalog
wrangler r2 bucket catalog enable $1

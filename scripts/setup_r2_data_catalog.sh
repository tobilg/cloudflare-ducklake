#!/bin/bash

# Enable R2 Data Catalog for given bucket
wrangler r2 bucket catalog enable $1

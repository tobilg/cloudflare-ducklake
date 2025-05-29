#!/bin/bash

# See: https://developers.cloudflare.com/r2/data-catalog/get-started/

rm -rf $PWD/iceberg-data

mkdir -p $PWD/iceberg-data

cp $PWD/scripts/python/create-iceberg-data.py $PWD/iceberg-data/create-iceberg-data.py

cd iceberg-data

uv venv

source .venv/bin/activate

uv pip install marimo pyarrow pyiceberg pandas

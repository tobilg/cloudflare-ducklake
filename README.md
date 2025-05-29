# cloudflare-ducklake
Running [DuckLake](https://ducklake.select/) on Cloudflare Containers, with DuckDB running as a Hono-based API.

![Screenshot of DuckDB running as API on Cloudflare containers](docs/cf-duckdb.png)

## Build image locally
Before being able to build the Docker image locally, you have to download the DuckDB extensions we'd like to package into the image, so that they don't need to be downloaded on each container start:

```bash
scripts/download_extensions.sh
```

Once this is done, you can run the following to build the image locally:
```bash
docker build -t tobilg/cloudflare-ducklake . 
```

## Run the image locally
To run the newly built image locally, run

```bash
docker run --rm -it -p 3000:3000 tobilg/cloudflare-ducklake 
```

To query the DuckDB API within the running container, use

```bash
curl --location 'http://localhost:3000/query' \
--header 'Content-Type: application/json' \
--data '{
    "query": "SELECT * FROM '\''https://shell.duckdb.org/data/tpch/0_01/parquet/orders.parquet'\'' LIMIT 1000"
}'
```

**Hint:**
Currently it's not possible to use `wrangler dev` during local development. I guess this will eventually change once Containers become GA.

## Normal Deployment
You need the most recent version of Wrangler on your machine, and **the Cloudflare account you want to deploy to needs to have Cloudflare Containers beta access**.

If those prerequirements are met, just do the following:

```bash
npm run deploy
```

This will push the Docker image to Cloudflare's registry, create a Workers-based API endpoint, as well as a DurableObject that manages/communicates with the container instances.

Once it's done, you can access the Workers API endpoint that gets shown from the command's output.

**Hint:** It's possible that it takes a few minutes until containers are available, and it's possible that you see some errors if you're hitting the API and it's not yet up.

## API
The Hono.js-based API offers a few endpoint:

* `GET /`: Will show a JSON welcome message
* `GET /_health`: Enables potential container health checking (currently not used)
* `POST /query`: Takes a `application/json` object body with a `query` property that contains the (encoded) SQL query. Returns the query result in `application/json` as well (see example above)

### Securing the API
You can generate and deploy a Workers secret named `API_TOKEN` that will automatically be used to secure the `/query` and `/streaming-query` endpoints once it's present:

```bash
wrangler secret put API_TOKEN
```

and the add the generated secret value as prompted by the Wrangler CLI.

## Deployment with DuckLake & R2 Data Catalog / Iceberg integration
With the `v1.3.0` release of DuckDB, it became possible to connect to the R2 Data Catalog. This means that you can now also read Iceberg data from R2's Object Storage directly from a SQL statement issued by DuckDB.

### R2 / R2 Data Catalog setup for Iceberg support
To create a new R2 bucket, and activate the R2 Data Catalog for the newly created bucket, you can run the following:

```bash
scripts/setup_r2.sh YOUR-BUCKET-NAME
```
where `YOUR-BUCKET-NAME` is your desired name for the bucket. 

If you'd want to set a [location hint](https://developers.cloudflare.com/r2/reference/data-location/#location-hints) or a [jurisdiction](https://developers.cloudflare.com/r2/reference/data-location/#available-jurisdictions), please edit the script accordingly before running it.

### Getting an Access Token
Please follow the instructions in the R2 docs on [how to create an API token](https://developers.cloudflare.com/r2/data-catalog/get-started/#3-create-an-api-token). You need to store this token in a secure location, as you'll need in in the next step (for the `R2_TOKEN` secret).

### Getting the R2 Data Catalog information
The information about the R2 Data Catalog URI (`R2_ENDPOINT` secret) and warehouse name (`R2_CATALOG` secret) can be gathered by running:

```bash
scripts/get_catalog_info.sh YOUR-BUCKET-NAME
```
where `YOUR-BUCKET-NAME` is your desired name for the bucket. 

Please also store this information somewhere, bceause you'll need in in the next step.

### Creating secrets
To create the necessary Workers secrets, run:

```bash
scripts/create_secrets.sh
```
and copy & paste the respective values you noted in the last two steps.

### Using the new DuckLake table format
[DuckLake](https://ducklake.select/) was announced on 2025-05-27. It represents a new table format. Read more about it at:
* [Manifesto](https://ducklake.select/manifesto/)
* [Specification](https://ducklake.select/docs/stable/specification/introduction)
* [Podcast episode](https://www.youtube.com/watch?v=zeonmOO9jm4)
* [FAQs](https://ducklake.select/faq)

As we want to deploy it in a multi-user fashion, we need a transactional client-server database, such as MySQL or Postgres as backing store for the catalog data. We chose []() becasue it's serverless, and it offers a free tier of 0.5GB storage, which should be enough to get started. Just create an account and create a new database. Note the connection parameters

### Writing Iceberg example data
As we need some example data if we want to test the new Iceberg capabilities, we need to create this data manually with a [Python script](scripts/python/create-iceberg-data.py).

For convenience, we'll use [Marimo](https://marimo.io) for this. It requires a working Python installation on your machine.

#### Setup Marimo
To setup Marimo, run the following npm task:

```bash
npm run iceberg:setup
```

This will create a new directory and install Marimo and some dependencies in a virtual environment.

#### Create the Iceberg example data
To create the Iceberg example data, run the following npm task:

```bash
npm run iceberg:create
```

This will start Marimo, and load the respective Python script. You'll need to edit the variables for `WAREHOUSE`, `CATALOG_URI` and `TOKEN` with the values gathered in the last steps. This is also described in the [R2 Data Catalog docs](https://developers.cloudflare.com/r2/data-catalog/get-started/#6-create-a-python-notebook-to-interact-with-the-data-warehouse).

After you did that, you can run the Python cells in the Marimo notebook, and should end up with some data created in the R2 Bucket.

### Running DuckDB with Iceberg support
Once you created the secrets as outlined above (all of them!), the application will automatically create a DuckDB secret for accessing the R2 Data Catalog, and attach the catalog as well under the name of `r2_datalake`. The example table created in the last step is called `people` and was created in the `default` schema.

#### Example query
Replace the `API_TOKEN` with your real API token and run the following:

```bash
curl --location 'http://localhost:8080/query' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer API_TOKEN' \
--data '{
    "query": "SELECT * FROM r2_datalake.default.people"
}'
```

This should return the response below:

```json
[
  {
    "id": "1",
    "name": "Alice",
    "score": 80
  },
  {
    "id": "2",
    "name": "Bob",
    "score": 92.5
  },
  {
    "id": "3",
    "name": "Charlie",
    "score": 88
  }
]
```
import DuckDB from 'duckdb';
import { filterQuery } from './queryFilter';

// Instantiate DuckDB
const duckDB = new DuckDB.Database(':memory:');

// Create connection
const connection = duckDB.connect();

// Promisify query method
export const query = (query: string, filteringEnabled = true): Promise<DuckDB.TableData> => {
  return new Promise((resolve, reject) => {
    connection.all(filterQuery(query, filteringEnabled), (err, res) => {
      if (err) reject(err);
      resolve(res);
    });
  });
};

export const streamingQuery = (query: string, filteringEnabled = true): Promise<DuckDB.IpcResultStreamIterator> => {
  return connection.arrowIPCStream(filterQuery(query, filteringEnabled));
};

export const initialize = async () => {
  // Load home directory
  await query("SET home_directory='/tmp';", false);
  // Load httpfs
  await query("INSTALL '/app/extensions/httpfs.duckdb_extension';", false);
  await query("LOAD '/app/extensions/httpfs.duckdb_extension';", false);
  // Load iceberg
  await query("INSTALL '/app/extensions/iceberg.duckdb_extension';", false);
  await query("LOAD '/app/extensions/iceberg.duckdb_extension';", false);
  // Load ducklake
  await query("INSTALL '/app/extensions/ducklake.duckdb_extension';", false);
  await query("LOAD '/app/extensions/ducklake.duckdb_extension';", false);
  // Load nanoarrow
  await query("INSTALL '/app/extensions/nanoarrow.duckdb_extension';", false);
  await query("LOAD '/app/extensions/nanoarrow.duckdb_extension';", false);
  // Load postgres
  await query("INSTALL '/app/extensions/postgres_scanner.duckdb_extension';", false);
  await query("LOAD '/app/extensions/postgres_scanner.duckdb_extension';", false);

  // Create R2 Data Catalog secret if env vars are set, and attach catalog
  if (process.env.R2_TOKEN && process.env.R2_ENDPOINT && process.env.R2_CATALOG) {
    // Create secrets
    await query(
      `CREATE OR REPLACE SECRET r2_catalog_secret (TYPE ICEBERG, TOKEN '${process.env.R2_TOKEN}', ENDPOINT '${process.env.R2_ENDPOINT}');`,
      false,
    );
    // Attach catalog
    await query(
      `ATTACH '${process.env.R2_CATALOG}' AS r2lake (TYPE ICEBERG, ENDPOINT '${process.env.R2_ENDPOINT}');`,
      false,
    );

    console.log('Done initializing Iceberg');
  }

  // Create R2 secret & attach DuckLake if env vars are set
  if (
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_BUCKET &&
    process.env.POSTGRES_DB &&
    process.env.POSTGRES_HOST &&
    process.env.POSTGRES_USER &&
    process.env.POSTGRES_PASSWORD
  ) {
    // Create secret
    await query(
      `CREATE OR REPLACE SECRET r2 (TYPE R2, KEY_ID '${process.env.R2_ACCESS_KEY_ID}', SECRET '${process.env.R2_SECRET_ACCESS_KEY}', ACCOUNT_ID '${process.env.R2_ACCOUNT_ID}');`,
      false,
    );
    // Attach remote Postgres
    await query(
      `ATTACH 'ducklake:postgres:dbname=${process.env.POSTGRES_DB} host=${process.env.POSTGRES_HOST} user=${process.env.POSTGRES_USER} password=${process.env.POSTGRES_PASSWORD} sslmode=require' AS ducklake (DATA_PATH 'r2://${process.env.R2_BUCKET}/data');`,
      false,
    );

    console.log('Done initializing DuckLake');
  }

  // Whether or not the global http metadata is used to cache HTTP metadata, see https://github.com/duckdb/duckdb/pull/5405
  await query('SET enable_http_metadata_cache=true;', false);

  // Whether or not object cache is used to cache e.g. Parquet metadata
  await query('SET enable_object_cache=true;', false);

  // Whether or not version guessing is enabled
  await query('SET unsafe_enable_version_guessing=true;', false);

  // Lock the local file system, because using R2 for storage
  await query("SET disabled_filesystems = 'LocalFileSystem';", false);

  // Lock the configuration
  await query('SET lock_configuration=true;', false);

  console.log('Done initializing DuckDB');
};

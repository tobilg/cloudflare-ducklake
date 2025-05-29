import { DuckDBConnection, DuckDBInstance, DuckDBValue } from '@duckdb/node-api';
import { filterQuery } from './queryFilter';

export const createConnection = async () => {
  // Instantiate DuckDB
  const duckDB = await DuckDBInstance.create(':memory:', {});

  // Create connection
  const connection = await duckDB.connect();

  return connection;
}

export const query = async (connection: DuckDBConnection, query: string, filteringEnabled = true): Promise<Record<string, DuckDBValue>[]> => {
  const reader = await connection.runAndReadAll(filterQuery(query, filteringEnabled));
  return reader.getRowObjects();
}

export const initialize = async (connection: DuckDBConnection) => {
  // Load home directory
  await query(connection, `SET home_directory='/tmp';`, false);

  await query(connection, 'INSTALL \'/app/extensions/httpfs.duckdb_extension\';', false);
  await query(connection, 'LOAD \'/app/extensions/httpfs.duckdb_extension\';', false);

  await query(connection, 'INSTALL \'/app/extensions/iceberg.duckdb_extension\';', false);
  await query(connection, 'LOAD \'/app/extensions/iceberg.duckdb_extension\';', false); 

  // Load ducklake
  await query(connection, 'INSTALL \'/app/extensions/ducklake.duckdb_extension\';', false);
  await query(connection, 'LOAD \'/app/extensions/ducklake.duckdb_extension\';', false);
  // Load postgres
  await query(connection, 'INSTALL \'/app/extensions/postgres_scanner.duckdb_extension\';', false);
  await query(connection, 'LOAD \'/app/extensions/postgres_scanner.duckdb_extension\';', false);

  // Create R2 Data Catalog secret if env vars are set, and attach catalog
  if (process.env.R2_TOKEN && process.env.R2_ENDPOINT && process.env.R2_CATALOG) {
    // Create secrets
    await query(connection, `CREATE OR REPLACE SECRET r2_catalog_secret (TYPE ICEBERG, TOKEN '${process.env.R2_TOKEN}', ENDPOINT '${process.env.R2_ENDPOINT}');`, false);
    // Attach catalog
    await query(connection, `ATTACH '${process.env.R2_CATALOG}' AS r2_datalake (TYPE ICEBERG, ENDPOINT '${process.env.R2_ENDPOINT}');`, false);
  }
  
  // Create R2 secret if env vars are set
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ACCOUNT_ID) {
    // Create secret
    await query(connection, `CREATE OR REPLACE SECRET r2 (TYPE R2, KEY_ID '${process.env.R2_ACCESS_KEY_ID}', SECRET '${process.env.R2_SECRET_ACCESS_KEY}', ACCOUNT_ID '${process.env.R2_ACCOUNT_ID}');`, false);
    // Attach remote Postgres
    await query(connection, `ATTACH 'ducklake:postgres:dbname=${process.env.POSTGRES_DB} host=${process.env.POSTGRES_HOST} user=${process.env.POSTGRES_USER} password=${process.env.POSTGRES_PASSWORD} sslmode=require' AS ducklake (DATA_PATH 'r2://ducklake-bucket/data');`, false);
    await query(connection, `USE ducklake;`, false);
    // Lock the local file system, because using R2 for storage
    await query(connection, `SET disabled_filesystems = 'LocalFileSystem';`, false);
  } else {
    // Attach remote Postgres
    await query(connection, `ATTACH 'ducklake:postgres:dbname=${process.env.POSTGRES_DB} host=${process.env.POSTGRES_HOST} user=${process.env.POSTGRES_USER} password=${process.env.POSTGRES_PASSWORD} sslmode=require' AS ducklake (DATA_PATH '/app/data');`, false);
    await query(connection, `USE ducklake;`, false);
    // Can't lock the local file system because using container-local storage, so ignored
  }

  // Whether or not the global http metadata is used to cache HTTP metadata, see https://github.com/duckdb/duckdb/pull/5405
  await query(connection, 'SET enable_http_metadata_cache=true;', false);

  // Whether or not object cache is used to cache e.g. Parquet metadata
  await query(connection, 'SET enable_object_cache=true;', false);

  // Whether or not version guessing is enabled
  await query(connection, 'SET unsafe_enable_version_guessing=true;', false);

  // Lock the configuration
  await query(connection, `SET lock_configuration=true;`, false);

  console.log('DuckDB initialized');
};

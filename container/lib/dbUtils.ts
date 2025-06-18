import { type DuckDBConnection, DuckDBInstance, type DuckDBValue } from '@duckdb/node-api';
import { filterQuery } from './queryFilter';

export interface Database {
  name: string;
  schemas?: Schema[];
}

export interface Schema {
  name: string;
  tables?: Table[];
  views?: View[];
}

export interface View {
  databaseName?: string;
  schemaName?: string;
  name: string;
  sql?: string;
  columns?: Column[];
}

export interface Table {
  databaseName?: string;
  schemaName?: string;
  name: string;
  hasPrimaryKey: boolean;
  estimatedRowCount: number;
  columnCount: number;
  indexCount: number;
  checkConstraintCount: number;
  sql: string;
  columns?: Column[];
}

export interface BasicTable {
  databaseName: string;
  schemaName: string;
  name: string;
  sql: string;
}

export interface Column {
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
  name: string;
  dataType: string;
  precision: number;
  scale: number;
  isNullable: boolean;
}

export const createConnection = async () => {
  // Instantiate DuckDB
  const duckDB = await DuckDBInstance.create(':memory:', {});

  // Create connection
  const connection = await duckDB.connect();

  return connection;
};

export const query = async (
  connection: DuckDBConnection,
  query: string,
  filteringEnabled = true,
): Promise<Record<string, DuckDBValue>[]> => {
  const reader = await connection.runAndReadAll(filterQuery(query, filteringEnabled));
  return reader.getRowObjects();
};

export const initialize = async (connection: DuckDBConnection) => {
  // Load home directory
  await query(connection, "SET home_directory='/tmp';", false);
  // Load httpfs
  await query(connection, "INSTALL '/app/extensions/httpfs.duckdb_extension';", false);
  await query(connection, "LOAD '/app/extensions/httpfs.duckdb_extension';", false);
  // Load iceberg
  await query(connection, "INSTALL '/app/extensions/iceberg.duckdb_extension';", false);
  await query(connection, "LOAD '/app/extensions/iceberg.duckdb_extension';", false);
  // Load ducklake
  await query(connection, "INSTALL '/app/extensions/ducklake.duckdb_extension';", false);
  await query(connection, "LOAD '/app/extensions/ducklake.duckdb_extension';", false);
  // Load nanoarrow
  await query(connection, "INSTALL '/app/extensions/nanoarrow.duckdb_extension';", false);
  await query(connection, "LOAD '/app/extensions/nanoarrow.duckdb_extension';", false);
  // Load postgres
  await query(connection, "INSTALL '/app/extensions/postgres_scanner.duckdb_extension';", false);
  await query(connection, "LOAD '/app/extensions/postgres_scanner.duckdb_extension';", false);

  // Create R2 Data Catalog secret if env vars are set, and attach catalog
  if (process.env.R2_TOKEN && process.env.R2_ENDPOINT && process.env.R2_CATALOG) {
    // Create secrets
    await query(
      connection,
      `CREATE OR REPLACE SECRET r2_catalog_secret (TYPE ICEBERG, TOKEN '${process.env.R2_TOKEN}', ENDPOINT '${process.env.R2_ENDPOINT}');`,
      false,
    );
    // Attach catalog
    await query(
      connection,
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
      connection,
      `CREATE OR REPLACE SECRET r2 (TYPE R2, KEY_ID '${process.env.R2_ACCESS_KEY_ID}', SECRET '${process.env.R2_SECRET_ACCESS_KEY}', ACCOUNT_ID '${process.env.R2_ACCOUNT_ID}');`,
      false,
    );
    // Attach remote Postgres
    await query(
      connection,
      `ATTACH 'ducklake:postgres:dbname=${process.env.POSTGRES_DB} host=${process.env.POSTGRES_HOST} user=${process.env.POSTGRES_USER} password=${process.env.POSTGRES_PASSWORD} sslmode=require' AS ducklake (DATA_PATH 'r2://${process.env.R2_BUCKET}/data');`,
      false,
    );

    console.log('Done initializing DuckLake');
  }

  // Whether or not the global http metadata is used to cache HTTP metadata, see https://github.com/duckdb/duckdb/pull/5405
  await query(connection, 'SET enable_http_metadata_cache=true;', false);

  // Whether or not object cache is used to cache e.g. Parquet metadata
  await query(connection, 'SET enable_object_cache=true;', false);

  // Whether or not version guessing is enabled
  await query(connection, 'SET unsafe_enable_version_guessing=true;', false);

  // Lock the local file system, because using R2 for storage
  await query(connection, "SET disabled_filesystems = 'LocalFileSystem';", false);

  // Lock the configuration
  await query(connection, 'SET lock_configuration=true;', false);

  console.log('Done initializing DuckDB');
};

const getTables = async (connection: DuckDBConnection): Promise<BasicTable[]> => {
  const tablesAndViewsQuery = `SELECT databaseName, schemaName, name, sql FROM (
  SELECT database_name as databaseName, schema_name as schemaName, table_name as name, sql FROM duckdb_tables() WHERE database_name NOT IN ('system', 'temp', '__ducklake_metadata_ducklake') and schema_name NOT IN ('information_schema', 'pg_catalog') and internal = false
  UNION ALL
  SELECT database_name as databaseName, schema_name as schemaName, view_name as name, sql FROM duckdb_views() WHERE database_name NOT IN ('system', 'temp', '__ducklake_metadata_ducklake') and schema_name NOT IN ('information_schema', 'pg_catalog') and internal = false
  ) ORDER BY databaseName, schemaName, name`;

  const tablesAndViews = (await query(connection, tablesAndViewsQuery, false)) as unknown as BasicTable[];

  return tablesAndViews;
}

const getMetadata = async (connection: DuckDBConnection): Promise<Database[]> => {
  // Database metadata query
  const databaseMetadataQuery = `SELECT database_name as databaseName FROM duckdb_databases() WHERE database_name NOT IN ('system', 'temp', '__ducklake_metadata_ducklake') ORDER BY database_name`;
  // Schema metadata query
  const schemaMetadataQuery = `SELECT database_name as databaseName, schema_name as schemaName FROM duckdb_schemas() WHERE database_name NOT IN ('system', 'temp', '__ducklake_metadata_ducklake') and schema_name NOT IN ('information_schema', 'pg_catalog') ORDER BY database_name, schema_name`;
  // Table metadata query
  const tablesMetadataQuery = `SELECT database_name as databaseName, schema_name as schemaName, table_name as name, has_primary_key as hasPrimaryKey, estimated_size as estimatedRowCount, column_count as columnCount, index_count as indexCount, check_constraint_count as checkConstraintCount, sql FROM duckdb_tables() WHERE internal = false ORDER BY database_name, schema_name, table_name`;
  // View metadata query
  const viewsMetadataQuery = `SELECT database_name as databaseName, schema_name as schemaName, view_name as name, sql FROM duckdb_views() WHERE internal = false`;
  // Column metadata query
  const columnsMetadataQuery = `SELECT database_name as databaseName, schema_name as schemaName, table_name as tableName, column_name as name, data_type as dataType, numeric_precision as precision, numeric_scale as scale, is_nullable as isNullable FROM duckdb_columns() WHERE internal = false ORDER BY database_name, schema_name, table_name, column_index`;
  
  const databaseRaw = await query(connection, databaseMetadataQuery, false)
  const schemas = await query(connection, schemaMetadataQuery, false)
  const tables = await query(connection, tablesMetadataQuery, false);
  const views = await query(connection, viewsMetadataQuery, false);
  const columns = await query(connection, columnsMetadataQuery, false);

  const databases = databaseRaw.map((database) => ({
    name: database.databaseName as string,
    schemas: [
      ...new Set(
        schemas
          .filter((schema) => database.databaseName === schema.databaseName)
          .map(
            (schema) =>
              ({
                name: schema.schemaName,
                tables: [
                  ...new Set(
                    tables
                      .filter(
                        (table) =>
                          schema.databaseName === table.databaseName && schema.schemaName === table.schemaName,
                      )
                      .map((table) => ({
                        databaseName: database.databaseName,
                        schemaName: schema.schemaName,
                        name: table.name,
                        hasPrimaryKey: table.hasPrimaryKey,
                        estimatedRowCount: table.estimatedRowCount,
                        columnCount: table.columnCount,
                        indexCount: table.indexCount,
                        checkConstraintCount: table.checkConstraintCount,
                        sql: table.sql,
                        columns: [
                          ...new Set(
                            columns
                              .filter(
                                (column) =>
                                  column.databaseName === table.databaseName &&
                                  column.schemaName === table.schemaName &&
                                  column.tableName === table.name,
                              )
                              .map(
                                (column) =>
                                  ({
                                    name: column.name,
                                    dataType: column.dataType,
                                    precision: column.precision,
                                    scale: column.scale,
                                    isNullable: column.isNullable,
                                  }) as Column,
                              ),
                          ),
                        ],
                      } as Table
                    )),
                  ),
                ],
                views: [
                  ...new Set(
                    views
                      .filter(
                        (view) => view.databaseName === schema.databaseName && view.schemaName === schema.schemaName,
                      )
                      .map(
                        (view) =>
                          ({
                            databaseName: database.databaseName,
                            schemaName: schema.schemaName,
                            name: view.name,
                            sql: view.sql,
                            columns: [
                              ...new Set(
                                columns
                                  .filter(
                                    (column) =>
                                      column.databaseName === view.databaseName &&
                                      column.schemaName === view.schemaName &&
                                      column.tableName === view.name,
                                  )
                                  .map(
                                    (column) =>
                                      ({
                                        name: column.name,
                                        dataType: column.dataType,
                                        precision: column.precision,
                                        scale: column.scale,
                                        isNullable: column.isNullable,
                                      }) as Column,
                                  ),
                              ),
                            ],
                          }) as View,
                      ),
                  ),
                ],
              }
            ) as Schema,
          ),
      ),
    ],
  }));

  return databases;
}

export const generateTableSchemas = async (connection: DuckDBConnection): Promise<string | undefined> => {
  const databases = await getMetadata(connection);

  // Table schema placeholder
  let tableSchemas: string | undefined;

  if (databases && databases.length > 0) {
    // Get tables
    const tables = databases
      .map((database) => database.schemas!.map((schema) => schema.tables!))
      .flat()
      .flat();

    if (tables && tables.length > 0) {
      tableSchemas = tables
        .map((table) => table.sql.replace(`${table.name}`, `"${table.databaseName}"."${table.schemaName}"."${table.name}"`))
        .join("\n\n");
    }
  }

  return tableSchemas;
};

export const generateTableSchema = async (connection: DuckDBConnection): Promise<string> => {
  const tables = await getTables(connection);

  // Table schema placeholder
  let tableSchemas: string = '';

  if (tables && tables.length > 0) {
    tableSchemas = tables
      .map((table) => table.sql.replace(`${table.name}`, `"${table.databaseName}"."${table.schemaName}"."${table.name}"`))
      .join("\n\n");
  }

  return tableSchemas;
};

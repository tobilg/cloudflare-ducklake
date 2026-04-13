export type DuckDBError = {
  message: string;
  type: string;
};

// Errors from @duckdb/node-api are standard Error instances whose message is
// prefixed with the DuckDB error class, e.g. "Catalog Error: Table ...".
// This extracts the prefix into `type` and leaves the original message intact.
const ERROR_TYPE_PATTERN = /^([A-Z][A-Za-z]* Error): /;

export const parseDuckDBError = (error: unknown): DuckDBError => {
  if (error instanceof Error) {
    const match = error.message.match(ERROR_TYPE_PATTERN);
    return {
      message: error.message,
      type: match?.[1] ?? 'Error',
    };
  }
  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    type: 'Error',
  };
};

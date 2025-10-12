export type RawDuckDBError = {
  errno?: number;
  code?: string;
  errorType?: string;
  stack?: string;
};

export type DuckDBError = {
  message: string;
  type: string;
  code: string;
  errno: number | string;
};

export const parseDuckDBError = (error: unknown): DuckDBError => {
  const duckDBError = error as RawDuckDBError;
  return {
    message: duckDBError?.stack?.replace(/^Error: /, '') || 'Unknown error',
    type: duckDBError?.errorType || 'Unknown type',
    code: duckDBError?.code || 'Unknown code',
    errno: duckDBError?.errno ||'Unknown errno',
  } as DuckDBError;
};

export const filterQuery = (query: string | undefined, filteringEnabled = true): string => {
  if (query && filteringEnabled && query.toLowerCase().indexOf('duckdb_settings') > -1) {
    return `select 'Function is disabled' as error`;
  }
  if (query && filteringEnabled && query.trim().toLowerCase().startsWith('install')) {
    return `select 'Extension installation disabled' as error`;
  }
  if (query && filteringEnabled && query.trim().toLowerCase().startsWith('load')) {
    return `select 'Extension loading is disabled' as error`;
  }
  if (query && filteringEnabled && query.toLowerCase().indexOf('set') > -1) {
    return `select 'Using SET is disabled' as error`;
  }
  if (query && filteringEnabled && query.toLowerCase().indexOf('pragma') > -1) {
    return `select 'Using PRAGMA is disabled' as error`;
  }
  if (query && filteringEnabled && query.toLowerCase().indexOf('secret') > -1) {
    return `select 'Using SECRET is disabled' as error`;
  }
  return query || '';
};

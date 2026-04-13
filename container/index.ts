import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { generateTableSchemas, initialize, query } from './lib/dbUtils';
import { parseDuckDBError } from './lib/helpers';
import Logger from './lib/logger';

// Setup bindings
type Bindings = {
  USERNAME: string;
  PASSWORD: string;
  API_TOKEN: string;
  PORT: string;
};

// Instantiate logger
const apiLogger = new Logger({
  name: 'duckdb-api-logger',
}).getInstance();

// Get environment variables
const { USERNAME, PASSWORD, API_TOKEN, PORT } = process.env;

// Setup port
const port = PORT ? parseInt(PORT) : 3000;

// Store initialization
let isInitialized = false;

// Setup API
const api = new Hono<{ Bindings: Bindings }>();

// Setup routes & middleware
api.get('/', (c) => c.json({ message: 'Welcome to DuckDB API' }));
api.use(prettyJSON());
api.use('*', requestId());
api.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

// Enable CORS
api.use('/query', cors());

// Enable basic auth if username & password are set
if (USERNAME && PASSWORD) {
  api.use('/query', basicAuth({ username: USERNAME, password: PASSWORD }));
}

// Enable bearer auth if API_TOKEN is set
if (API_TOKEN) {
  api.use('/query', bearerAuth({ token: API_TOKEN }));
  api.use('/schema', bearerAuth({ token: API_TOKEN }));
}

// Get table schema
api.get('/schema', async (c) => {
  // Setup logger
  const requestLogger = apiLogger.child({ requestId: c.get('requestId') });

  // Check if DuckDB has been initalized
  if (!isInitialized) {
    // Run initalization queries
    await initialize();

    // Store initialization
    isInitialized = true;
  }

  try {
    const schema = await generateTableSchemas();

    requestLogger.debug({
      path: c.req.path,
    });

    return c.json({ schema }, 200);
  } catch (error: unknown) {
    const parsedDuckDBError = parseDuckDBError(error);

    requestLogger.error(parsedDuckDBError);
    return c.json({ error: parsedDuckDBError }, 500);
  }
});

// Setup query route
api.post('/query', async (c) => {
  // Setup logger
  const requestLogger = apiLogger.child({ requestId: c.get('requestId') });

  // Parse body with query
  const body = await c.req.json();

  if (!body.hasOwnProperty('query')) {
    return c.json({ error: 'Missing query property in request body!' }, 400);
  }

  // Check if DuckDB has been initalized
  if (!isInitialized) {
    // Run initalization queries
    await initialize();

    // Store initialization
    isInitialized = true;
  }

  // Track query start timestamp
  const queryStartTimestamp = new Date().getTime();

  try {
    // Run query
    const queryResult = await query(body.query);

    // Track query end timestamp
    const queryEndTimestamp = new Date().getTime();

    requestLogger.debug({
      query: body.query,
      path: c.req.path,
      queryStartTimestamp,
      queryEndTimestamp,
    });

    return c.json(queryResult, 200);
  } catch (error: unknown) {
    const parsedDuckDBError = parseDuckDBError(error);

    requestLogger.error(parsedDuckDBError);
    return c.json({ error: parsedDuckDBError }, 500);
  }
});

// Serve API
const server = serve(
  {
    fetch: api.fetch,
    port,
  },
  (info) => {
    apiLogger.info(`Listening on http://localhost:${info.port}`);
  },
);

// Graceful shutdown for SIGINT
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});

// Graceful shutdown for SIGTERM
process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      apiLogger.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});

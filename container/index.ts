import type { DuckDBConnection } from '@duckdb/node-api';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { createConnection, initialize, query } from './lib/dbUtils';

// Setup bindings
type Bindings = {
  API_TOKEN: string;
};

// Patch BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Get environment variables
const { API_TOKEN } = process.env;

// Setup port
const port = 3000;

// Store initialization
let isInitialized = false;

let connection: DuckDBConnection | null = null;

// Instantiate Hono
const api = new Hono<{ Bindings: Bindings }>();

// // Setup routes & middleware
api.get('/', (c) => c.json({ message: 'Welcome to DuckDB API' }));
api.get('/_health', (c) => c.text('OK'));
api.use(prettyJSON());
api.use(logger());
api.use('*', requestId());
api.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

// // Enable basic auth if username & password are set
if (API_TOKEN) {
  api.use('/query', bearerAuth({ token: API_TOKEN }));
}

// Setup query route
api.post('/query', async (c) => {
  // Parse body with query
  const body = await c.req.json();

  if (!Object.keys(body).includes('query')) {
    return c.json({ error: 'Missing query property in request body!' }, 400);
  }

  if (!connection) {
    connection = await createConnection();
  }

  // Check if DuckDB has been initalized
  if (!isInitialized) {
    // Run initalization queries
    await initialize(connection);

    // Store initialization
    isInitialized = true;
  }

  try {
    // Run query
    const queryResult = await query(connection, body.query);

    return c.json(queryResult, 200);
  } catch (error: any) {
    console.error(JSON.stringify(error, null, 2));
    return c.json(
      { error: error?.message.replace(/\n/g, ' ').replace(/\"/g, "'").replace('^', '').trim() || 'Unknown error' },
      500,
    );
  }
});

// Serve API
const server = serve(
  {
    fetch: api.fetch,
    port,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  },
);

// graceful shutdown
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});

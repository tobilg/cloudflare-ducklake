import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { basicAuth } from 'hono/basic-auth';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import Logger from './lib/logger';
import { generateTableSchema, initialize, query, streamingQuery } from './lib/dbUtils';

// Setup bindings
type Bindings = {
  USERNAME: string;
  PASSWORD: string;
  API_TOKEN: string;
};

// Patch BigInt
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
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

// Instantiate Hono
const app = new Hono();

// Setup routes & middleware
app.get('/', (c) => c.json({ message: 'Welcome to DuckDB API' }));
app.get('/_health', (c) => c.text('OK'));
app.use(prettyJSON());
app.use(logger());
app.use('*', requestId());
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

// Setup API
const api = new Hono<{ Bindings: Bindings }>();

// Setup routes & middleware
api.get('/', (c) => c.json({ message: 'Welcome to DuckDB API' }));
api.use(prettyJSON());
api.use(logger());
api.use('*', requestId());
api.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

// Enable CORS
api.use('/query', cors());
api.use('/streaming-query', cors());

// Enable basic auth if username & password are set
if (USERNAME && PASSWORD) {
  api.use('/query', basicAuth({ username: USERNAME, password: PASSWORD }));
  api.use('/streaming-query', basicAuth({ username: USERNAME, password: PASSWORD }));
}

// Enable bearer auth if API_TOKEN is set
if (API_TOKEN) {
  api.use('/query', bearerAuth({ token: API_TOKEN }));
  api.use('/schema', bearerAuth({ token: API_TOKEN }));
}

// Get table schema
api.get('/schema', async (c) => {
  // Check if DuckDB has been initalized
  if (!isInitialized) {
    // Run initalization queries
    await initialize();

    // Store initialization
    isInitialized = true;
  }

  const tableSchema = await generateTableSchema();

  return c.text(tableSchema, 200);
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
      queryStartTimestamp,
      queryEndTimestamp,
    });

    return c.json(queryResult, 200);
  } catch (error) {
    return c.json({ error: error }, 500);
  }
});

// Setup query route
api.post('/streaming-query', async (c) => {
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

  try {
    // Set content type to Arrow IPC stream
    c.header('Content-Type', 'application/vnd.apache.arrow.stream');

    // Set HTTP status code
    c.status(200);

    // Stream response
    return stream(c, async (stream) => {
      // Write a process to be executed when aborted.
      stream.onAbort(() => {
        requestLogger.error('Aborted!');
      });

      // Get Arrow IPC stream
      const arrowStream = await streamingQuery(body.query, true);

      // Stream Arrow IPC stream to response
      for await (const chunk of arrowStream) {
        // Write chunk
        await stream.write(chunk);
      }
    });
  } catch (error) {
    return c.json({ error: error }, 500);
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
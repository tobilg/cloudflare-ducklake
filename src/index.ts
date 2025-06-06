import { Container } from '@cloudflare/containers';

export default class DuckDBContainer extends Container {
  constructor(ctx: any, env: any) {
    super(ctx, env);

    let envConfig: Record<string, string> = {};

    // Add API token if provided
    if (env.API_TOKEN) {
      envConfig = {
        ...envConfig,
        API_TOKEN: env.API_TOKEN,
      };
    }
    // Add R2 Data Catalog credentials if provided -> For Iceberg to work
    if (env.R2_TOKEN && env.R2_ENDPOINT && env.R2_CATALOG) {
      envConfig = {
        ...envConfig,
        R2_TOKEN: env.R2_TOKEN,
        R2_ENDPOINT: env.R2_ENDPOINT,
        R2_CATALOG: env.R2_CATALOG,
      };
    }
    // Add Postgres & R2 credentials if provided -> For DuckLake to work
    // Hint: Port is not needed because it's using the default port 5432
    if (
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.POSTGRES_USER &&
      env.POSTGRES_PASSWORD &&
      env.POSTGRES_HOST &&
      env.POSTGRES_DB
    ) {
      envConfig = {
        ...envConfig,
        R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
        R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
        R2_BUCKET: env.R2_BUCKET,
        POSTGRES_USER: env.POSTGRES_USER,
        POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
        POSTGRES_HOST: env.POSTGRES_HOST,
        POSTGRES_DB: env.POSTGRES_DB,
      };
    }

    this.defaultPort = 3000;
    this.sleepAfter = "1m";
    this.enableInternet = true;
    this.env = envConfig;
  }

  /**
   * Process an incoming request and route to different ports based on path
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith('/query')) {
        // API server runs on port 3000
        return await this.containerFetch(request, 3000);
      } else {
        return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, {
        status: 500
      });
    }
  }
}

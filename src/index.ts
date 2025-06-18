import { Container as PkgContainer } from '@cloudflare/containers';

interface EnvWithCustomVariables extends Env {
  API_TOKEN: string;
  R2_TOKEN: string;
  R2_ENDPOINT: string;
  R2_CATALOG: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_HOST: string;
  POSTGRES_DB: string;
}

export class Container extends PkgContainer<EnvWithCustomVariables> {
  constructor(ctx: any, env: EnvWithCustomVariables) {
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
    this.envVars = envConfig;
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    try {
      return await env.CONTAINER.get(env.CONTAINER.idFromName('cloudflare-ducklake')).fetch(request);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('Error fetch:', err.message);
        return new Response(err.message, { status: 500 });
      }
      return new Response('Unknown error', { status: 500 });
    }
  },
};


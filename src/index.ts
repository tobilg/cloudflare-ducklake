import { DurableObject } from 'cloudflare:workers';

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

export class Container extends DurableObject<EnvWithCustomVariables> {
  container: globalThis.Container;
  monitor?: Promise<unknown>;

  constructor(ctx: DurableObjectState, env: EnvWithCustomVariables) {
    super(ctx, env);
    this.container = ctx.container!;
    void this.ctx.blockConcurrencyWhile(async () => {
      const containerConfig: ContainerStartupOptions = {
        enableInternet: true,
      };
      // Add API token if provided
      if (this.env.API_TOKEN) {
        containerConfig.env = {
          API_TOKEN: this.env.API_TOKEN,
        };
      }
      // Add R2 Data Catalog credentials if provided -> For Iceberg to work
      if (this.env.R2_TOKEN && this.env.R2_ENDPOINT && this.env.R2_CATALOG) {
        containerConfig.env = {
          R2_TOKEN: this.env.R2_TOKEN,
          R2_ENDPOINT: this.env.R2_ENDPOINT,
          R2_CATALOG: this.env.R2_CATALOG,
        };
      }
      // Add Postgres & R2 credentials if provided -> For DuckLake to work
      // Hint: Port is not needed because it's using the default port 5432
      if (
        this.env.R2_ACCESS_KEY_ID &&
        this.env.R2_SECRET_ACCESS_KEY &&
        this.env.R2_ACCOUNT_ID &&
        this.env.R2_BUCKET &&
        this.env.POSTGRES_USER &&
        this.env.POSTGRES_PASSWORD &&
        this.env.POSTGRES_HOST &&
        this.env.POSTGRES_DB
      ) {
        containerConfig.env = {
          R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
          R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
          R2_BUCKET: this.env.R2_BUCKET,
          POSTGRES_USER: this.env.POSTGRES_USER,
          POSTGRES_PASSWORD: this.env.POSTGRES_PASSWORD,
          POSTGRES_HOST: this.env.POSTGRES_HOST,
          POSTGRES_DB: this.env.POSTGRES_DB,
        };
      }
      // Start container
      if (!this.container.running) this.container.start(containerConfig);
      this.monitor = this.container.monitor().then(() => ctx.abort()); // Will retrigger the constructor once a DO alarm runs or a request arrives
    });
  }

  async fetch(req: Request) {
    try {
      return await this.container.getTcpPort(3000).fetch(req.url.replace('https:', 'http:'), req);
    } catch (err: unknown) {
      if (err instanceof Error) {
        return new Response(`${this.ctx.id.toString()}: ${err.message}`, { status: 500 });
      }
      return new Response(`${this.ctx.id.toString()}: Unknown error`, { status: 500 });
    }
  }
}

export default {
  async fetch(request, env): Promise<Response> {
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
} satisfies ExportedHandler<Env>;

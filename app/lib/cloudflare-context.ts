import { RouterContextProvider } from 'react-router';

export interface CaCloudflare {
  env: Env;
  ctx: ExecutionContext;
}

/*
 * React Router 8 removed `AppLoadContext`; a loader's `context` is now a
 * `RouterContextProvider` and the request handler rejects anything that is not
 * an instance of it.
 *
 * Every route in this app reads `context.cloudflare.env`, so instead of touching
 * all ~43 call sites we subclass the provider and re-expose the Cloudflare
 * bindings as a plain `cloudflare` property. The matching type augmentation
 * lives in `load-context.ts`.
 */
export class CaRouterContext extends RouterContextProvider {
  readonly cloudflare: CaCloudflare;
  readonly clientAddress?: string;

  constructor(cloudflare: CaCloudflare, clientAddress?: string) {
    super();
    this.cloudflare = cloudflare;
    this.clientAddress = clientAddress;
  }
}

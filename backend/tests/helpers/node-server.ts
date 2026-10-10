import type { AddressInfo } from "node:net";
import type { Hono } from "hono";
import { serve } from "@hono/node-server";

export interface RunningServer {
  /** Base URL of the listening server, e.g. http://127.0.0.1:41234 */
  url: string;
  /** Resolves once the listener and every open connection are closed. */
  close: () => Promise<void>;
}

/**
 * Serve a Hono app through the real @hono/node-server adapter on an ephemeral
 * port (0), bound to the loopback interface. Tests that go through this helper
 * exercise the adapter's socket binding (getConnInfo), which app.request()
 * calls bypass entirely.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startNodeServer(app: Hono<any>): Promise<RunningServer> {
  return new Promise<RunningServer>((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
      (info: AddressInfo) => {
        resolve({
          url: `http://127.0.0.1:${info.port}`,
          close: () =>
            new Promise<void>((done, fail) => {
              // Drop keep-alive and still-open response sockets so close()
              // cannot hang the test process on a leftover connection.
              if ("closeAllConnections" in server) server.closeAllConnections();
              server.close((err) => (err ? fail(err) : done()));
            }),
        });
      },
    );
    server.once("error", reject);
  });
}

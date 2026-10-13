// Local-only request guard. The server has no authentication, so it accepts
// only loopback Host names (blocks DNS rebinding) and only same-origin JSON
// for state-changing methods (blocks cross-site simple POSTs).

import type { MiddlewareHandler } from "hono";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const WILDCARD = new Set(["0.0.0.0", "::", "[::]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAFE_FETCH_SITES = new Set(["same-origin", "none"]);

export interface BindOptions {
  host: string;
  port: number;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host.toLowerCase());
}

export function envFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

// Returns a warning for an allowed non-loopback bind; throws when not allowed.
export function checkBind(host: string, allowRemote: boolean): string | undefined {
  if (isLoopbackHost(host)) return undefined;
  if (!allowRemote) {
    throw new Error(
      `refusing to bind non-loopback host '${host}': this server has no authentication. ` +
        "Use 127.0.0.1, localhost or ::1, or pass --allow-remote to override.",
    );
  }
  return (
    `warning: binding '${host}' exposes an unauthenticated server beyond this machine. ` +
    "Put an authenticating proxy in front of it."
  );
}

export function allowedHosts(bind: BindOptions): Set<string> {
  const names = ["127.0.0.1", "localhost", "[::1]"];
  const host = bind.host.toLowerCase();
  if (!isLoopbackHost(host) && !WILDCARD.has(host)) {
    names.push(host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);
  }
  return new Set(names.map((n) => `${n}:${bind.port}`));
}

export function hostGuard(bind: BindOptions): MiddlewareHandler {
  const hosts = allowedHosts(bind);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  return async (c, next) => {
    const host = (c.req.header("host") ?? new URL(c.req.url).host).toLowerCase();
    if (!hosts.has(host)) return c.text("Host not allowed", 403);
    if (!SAFE_METHODS.has(c.req.method)) {
      const site = c.req.header("sec-fetch-site");
      if (site !== undefined && !SAFE_FETCH_SITES.has(site)) {
        return c.text("Cross-origin request forbidden", 403);
      }
      const origin = c.req.header("origin");
      if (origin !== undefined && !origins.has(origin.toLowerCase())) {
        return c.text("Cross-origin request forbidden", 403);
      }
      const type = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (type !== "application/json") {
        return c.text("Content-Type must be application/json", 415);
      }
    }
    await next();
  };
}

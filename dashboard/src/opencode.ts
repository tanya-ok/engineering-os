export interface RuntimeInspection {
  reachable: boolean;
  compatible: boolean;
  version: string | null;
  reason: string | null;
}

const REQUIRED: Record<string, string[]> = {
  "/session": ["get", "post"],
  "/session/{sessionID}/prompt_async": ["post"],
  "/session/{sessionID}/abort": ["post"],
  "/session/{sessionID}/diff": ["get"],
};

/** Transport only. This client does not grant permission to execute repository tasks. */
export class OpenCodeAdapter {
  private readonly origin: string;
  constructor(
    url: string,
    private readonly password: string,
    private readonly expectedVersion: string,
  ) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("OpenCode must use a numeric loopback HTTP origin");
    }
    if (!password || !expectedVersion)
      throw new Error("Runtime password and expected version are required");
    this.origin = parsed.origin;
  }
  private async request(route: string, method = "GET"): Promise<unknown> {
    const response = await fetch(`${this.origin}${route}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}`,
      },
    });
    if (!response.ok) throw new Error(`Runtime HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty runtime response");
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Runtime response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  }
  async inspect(): Promise<RuntimeInspection> {
    let version: string | null = null;
    let reachable = false;
    try {
      const health = (await this.request("/global/health")) as {
        healthy?: unknown;
        version?: unknown;
      };
      reachable = true;
      version = typeof health?.version === "string" ? health.version : null;
      if (health?.healthy !== true || version !== this.expectedVersion) {
        return {
          reachable,
          compatible: false,
          version,
          reason: "Runtime version or health does not match the verified configuration",
        };
      }
      const doc = (await this.request("/doc")) as {
        openapi?: unknown;
        paths?: Record<string, Record<string, unknown>>;
      };
      if (
        typeof doc?.openapi !== "string" ||
        !doc.openapi.startsWith("3.") ||
        !Object.entries(REQUIRED).every(([route, methods]) =>
          methods.every((method) => doc.paths?.[route]?.[method] != null),
        )
      ) {
        return {
          reachable,
          compatible: false,
          version,
          reason: "Required session API contract is missing",
        };
      }
      return { reachable, compatible: true, version, reason: null };
    } catch {
      return {
        reachable,
        compatible: false,
        version,
        reason: "Runtime unavailable or returned an invalid response",
      };
    }
  }
  private sessionRoute(id: string): string {
    if (!/^ses_[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid session id");
    return `/session/${id}`;
  }
  private async requireCompatible(): Promise<void> {
    if (!(await this.inspect()).compatible) throw new Error("Runtime compatibility check failed");
  }
  async diff(id: string): Promise<unknown[]> {
    const route = this.sessionRoute(id);
    await this.requireCompatible();
    const result = await this.request(`${route}/diff`);
    if (!Array.isArray(result)) throw new Error("Invalid diff response");
    return result;
  }
  async abort(id: string): Promise<void> {
    const route = this.sessionRoute(id);
    await this.requireCompatible();
    if ((await this.request(`${route}/abort`, "POST")) !== true)
      throw new Error("Runtime did not confirm cancellation");
  }
}

export class SourceBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceBlockedError";
  }
}

export class BudgetExceededError extends Error {
  constructor() {
    super("Budget de requêtes atteint pour cette source");
    this.name = "BudgetExceededError";
  }
}

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  /** Pause minimale entre deux requêtes (ms). */
  delayMs?: number;
  /** Nombre maximal de requêtes pour une synchronisation. */
  maxRequests?: number;
  retries?: number;
  timeoutMs?: number;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_USER_AGENT = "JobRadar/0.1 (outil personnel de veille emploi, une personne, faible volume)";

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Client HTTP poli : débit limité, budget de requêtes, timeouts, retries avec backoff exponentiel
 * sur 429/5xx/erreurs réseau. 401/403 = source bloquée ou accès refusé : arrêt immédiat, sans contournement.
 */
export class PoliteHttp {
  private last = 0;
  count = 0;
  private readonly o: Required<HttpOptions>;

  constructor(opts: HttpOptions = {}) {
    this.o = {
      fetchImpl: opts.fetchImpl ?? fetch,
      delayMs: opts.delayMs ?? 1500,
      maxRequests: opts.maxRequests ?? 150,
      retries: opts.retries ?? 3,
      timeoutMs: opts.timeoutMs ?? 20_000,
      userAgent: opts.userAgent ?? DEFAULT_USER_AGENT,
      sleep: opts.sleep ?? realSleep,
    };
  }

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (this.count >= this.o.maxRequests) throw new BudgetExceededError();
      const wait = this.last + this.o.delayMs - Date.now();
      if (wait > 0) await this.o.sleep(wait);
      this.last = Date.now();
      this.count++;
      let res: Response | null = null;
      let networkError: unknown = null;
      try {
        res = await this.o.fetchImpl(url, {
          ...init,
          headers: { "User-Agent": this.o.userAgent, "Accept-Language": "fr-FR,fr;q=0.9", ...(init.headers ?? {}) },
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
      } catch (err) {
        networkError = err;
      }
      if (res && (res.status === 401 || res.status === 403)) {
        throw new SourceBlockedError(`Accès refusé (HTTP ${res.status}) sur ${new URL(url).hostname}`);
      }
      const retryable = networkError !== null || (res !== null && (res.status === 429 || res.status >= 500));
      if (!retryable && res) return res;
      if (attempt >= this.o.retries) {
        if (res) return res;
        throw networkError instanceof Error ? networkError : new Error(String(networkError));
      }
      const retryAfter = Number(res?.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await this.o.sleep(Math.min(backoff, 60_000));
    }
  }

  async text(url: string, init?: RequestInit): Promise<string> {
    const res = await this.request(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return res.text();
  }

  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.request(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return (await res.json()) as T;
  }
}

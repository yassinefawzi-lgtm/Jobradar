import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "../src/app/api/cron/sync/route";

describe("cron Vercel → GitHub", () => {
  it("refuse sans le bon secret", async () => {
    process.env.CRON_SECRET = "secret-de-test";
    assert.equal((await GET(new Request("https://x/api/cron/sync"))).status, 401);
    assert.equal((await GET(new Request("https://x/api/cron/sync", { headers: { authorization: "Bearer faux" } }))).status, 401);
  });
  it("refuse tout si CRON_SECRET n'est pas configuré", async () => {
    delete process.env.CRON_SECRET;
    assert.equal((await GET(new Request("https://x/api/cron/sync", { headers: { authorization: "Bearer undefined" } }))).status, 401);
  });
  it("avec le secret mais sans jeton GitHub : échec signalé (502), rien déclenché", async () => {
    process.env.CRON_SECRET = "secret-de-test";
    delete process.env.GITHUB_DISPATCH_TOKEN;
    const res = await GET(new Request("https://x/api/cron/sync", { headers: { authorization: "Bearer secret-de-test" } }));
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { dispatched: false, status: 0 });
  });
});

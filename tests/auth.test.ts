import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPassword, createSessionToken, verifySessionToken } from "../src/lib/auth";

process.env.SESSION_SECRET = "x".repeat(40);
process.env.APP_PASSWORD = "mot-de-passe-de-test";

describe("authentification", () => {
  it("mot de passe correct / incorrect", async () => {
    assert.equal(await checkPassword("mot-de-passe-de-test"), true);
    assert.equal(await checkPassword("mauvais"), false);
    assert.equal(await checkPassword(""), false);
  });
  it("jeton de session valide, falsifié ou expiré", async () => {
    const t = await createSessionToken();
    assert.equal(await verifySessionToken(t), true);
    assert.equal(await verifySessionToken(t.slice(0, -2) + "zz"), false);
    assert.equal(await verifySessionToken(t.replace(/^v1\.\d+/, "v1.99999999999999")), false);
    assert.equal(await verifySessionToken(t, Date.now() + 31 * 86_400_000), false);
    assert.equal(await verifySessionToken(undefined), false);
  });
  it("sans secret configuré : tout est refusé", async () => {
    const t = await createSessionToken();
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "court";
    assert.equal(await verifySessionToken(t), false);
    assert.equal(await checkPassword("mot-de-passe-de-test"), false);
    process.env.SESSION_SECRET = saved;
  });
});

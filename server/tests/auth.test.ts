import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  validateCredentials,
  verifyPassword,
} from "../src/lib/auth.ts";

test("validateCredentials rejects weak input", () => {
  assert.ok(validateCredentials("", "password123"));
  assert.ok(validateCredentials("not-an-email", "password123"));
  assert.ok(validateCredentials("a@b.com", "short"));
  assert.equal(validateCredentials("a@b.com", "password123"), null);
});

test("hashPassword / verifyPassword round-trip", async () => {
  const hash = await hashPassword("password123");
  assert.notEqual(hash, "password123");
  assert.equal(await verifyPassword("password123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

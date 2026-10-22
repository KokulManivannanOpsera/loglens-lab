import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import test from "node:test";
import { fileURLToPath } from "url";
import { isLlmConfigured, redactSecrets } from "../src/lib/secrets.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

test("redactSecrets removes sk- shaped tokens and Bearer values", () => {
  const raw =
    "OpenAI HTTP 401: invalid sk-abcdefghijklmnopqrstuvwxyz012345 Bearer tok_secret_value";
  const out = redactSecrets(raw);
  assert.equal(out.includes("sk-abcdefghijklmnopqrstuvwxyz012345"), false);
  assert.match(out, /REDACTED/);
  assert.equal(out.includes("tok_secret_value"), false);
});

test(".env.example has no real key value", () => {
  const example = readFileSync(path.join(root, "server/.env.example"), "utf8");
  assert.match(example, /OPENAI_API_KEY=/);
  assert.doesNotMatch(example, /OPENAI_API_KEY=sk-/);
});

test("isLlmConfigured returns boolean only", () => {
  const v = isLlmConfigured();
  assert.equal(typeof v, "boolean");
});

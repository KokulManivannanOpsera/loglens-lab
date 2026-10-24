/**
 * BRING — Load role: k6 smoke vs health + mock diagnose.
 *
 * Usage (API must be up on :8091):
 *   k6 run scripts/load/smoke.js
 *
 * Env:
 *   BASE_URL=http://127.0.0.1:8091
 *   VUS=5
 *   DURATION=30s
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8091";

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
};

export function setup() {
  const email = `k6-${Date.now()}@example.com`;
  const res = http.post(
    `${BASE}/api/auth/signup`,
    JSON.stringify({ email, password: "password123" }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "signup 201": (r) => r.status === 201 });
  const cookie = res.cookies.loglens_session
    ? `loglens_session=${res.cookies.loglens_session[0].value}`
    : "";
  return { cookie };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Cookie: data.cookie || "",
  };

  const health = http.get(`${BASE}/api/health`);
  check(health, { "health ok": (r) => r.status === 200 });

  const diagnose = http.post(
    `${BASE}/api/diagnose`,
    JSON.stringify({
      logText: "FAIL Error: AssertionError expected 1 to equal 2",
      mode: "mock",
    }),
    { headers },
  );
  check(diagnose, {
    "diagnose 200": (r) => r.status === 200,
    "has diagnosis": (r) => {
      try {
        return Boolean(r.json("diagnosis"));
      } catch {
        return false;
      }
    },
  });

  sleep(0.3);
}

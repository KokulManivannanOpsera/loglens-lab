"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiagnoseResponse, Diagnosis } from "@/lib/types";

type FixtureInfo = { id: string; label: string };

export function LogLensApp() {
  const [fixtures, setFixtures] = useState<FixtureInfo[]>([]);
  const [logText, setLogText] = useState("");
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then(setFixtures)
      .catch(() => setError("Could not load fixtures"));
  }, []);

  const loadFixture = useCallback(async (id: string) => {
    setError(null);
    setDiagnosis(null);
    const res = await fetch(`/api/fixtures/${id}`);
    if (!res.ok) {
      setError("Fixture not found");
      return;
    }
    const data = (await res.json()) as { text: string };
    setLogText(data.text);
    setActiveFixture(id);
  }, []);

  async function onDiagnose() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logText, fixtureId: activeFixture }),
      });
      if (!res.ok) {
        setError("Diagnose failed");
        return;
      }
      const data = (await res.json()) as DiagnoseResponse;
      setDiagnosis(data.diagnosis);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <div className="badge">Phase A0 · mock AI</div>
        <h1>LogLens</h1>
        <p className="sub">
          Paste a CI log (or load a fixture) → get a <strong>draft</strong> diagnosis.
          No real LLM yet — rules mock the model so we learn the product shape first.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Log input</h2>
          <div className="fixtures">
            {fixtures.map((f) => (
              <button key={f.id} type="button" onClick={() => loadFixture(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <textarea
            value={logText}
            onChange={(e) => {
              setLogText(e.target.value);
              setActiveFixture(null);
              setDiagnosis(null);
            }}
            placeholder="Paste CI / test logs here…"
            spellCheck={false}
          />
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={loading || !logText.trim()}
              onClick={onDiagnose}
            >
              {loading ? "Diagnosing…" : "Diagnose (mock)"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setLogText("");
                setDiagnosis(null);
                setActiveFixture(null);
              }}
            >
              Clear
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <h2>Draft diagnosis</h2>
          {!diagnosis ? (
            <p className="empty">
              Run diagnose to see structured output (cause, evidence, next steps,
              confidence). Human still decides what to do next — no auto actions in A0.
            </p>
          ) : (
            <dl className="diag">
              <dt>Provider</dt>
              <dd>
                <span className="pill">{diagnosis.provider}</span>
              </dd>
              <dt>Summary</dt>
              <dd>{diagnosis.summary}</dd>
              <dt>Likely cause</dt>
              <dd>{diagnosis.likelyCause}</dd>
              <dt>Evidence</dt>
              <dd>
                <ul>
                  {diagnosis.evidence.map((e) => (
                    <li key={e}>
                      <code>{e}</code>
                    </li>
                  ))}
                </ul>
              </dd>
              <dt>Next steps</dt>
              <dd>
                <ul>
                  {diagnosis.nextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </dd>
              <dt>Confidence</dt>
              <dd>
                <span className={`pill ${diagnosis.confidence}`}>{diagnosis.confidence}</span>
                {diagnosis.needsHumanReview && (
                  <>
                    {" "}
                    <span className="pill review">needs human review</span>
                  </>
                )}
              </dd>
            </dl>
          )}
        </section>
      </div>

      <footer>
        Health: <a href="/api/health">/api/health</a> · Learning: see{" "}
        <code>LEARNING.md</code> · Port <code>8091</code>
      </footer>
    </div>
  );
}

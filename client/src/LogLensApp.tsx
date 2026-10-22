import { useCallback, useEffect, useState } from "react";
import { AuthScreen, type AuthUser } from "./AuthScreen";
import type {
  DiagnoseResponse,
  Diagnosis,
  HistoryListItem,
  Insights,
} from "./types";

type FixtureInfo = { id: string; label: string };
type View = "diagnose" | "history" | "insights";

const jsonCred = {
  credentials: "include" as const,
  headers: { "Content-Type": "application/json" },
};

export function LogLensApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>("diagnose");
  const [fixtures, setFixtures] = useState<FixtureInfo[]>([]);
  const [logText, setLogText] = useState("");
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [meta, setMeta] = useState<DiagnoseResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryListItem[]>([]);
  const [historyQ, setHistoryQ] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          setUser(null);
          return;
        }
        const data = (await r.json()) as { user: AuthUser };
        setUser(data.user);
      })
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setFixtures([]);
      return;
    }
    fetch("/api/fixtures", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          setUser(null);
          return [];
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setFixtures(data);
      })
      .catch(() => setError("Could not load fixtures"));
  }, [user]);

  const loadHistory = useCallback(
    async (q?: string) => {
      setHistoryLoading(true);
      setError(null);
      try {
        const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
        const res = await fetch(`/api/history${qs}`, { credentials: "include" });
        if (res.status === 401) {
          setUser(null);
          return;
        }
        if (!res.ok) {
          setError("Could not load history");
          return;
        }
        const data = (await res.json()) as { items: HistoryListItem[] };
        setHistory(data.items);
      } catch {
        setError("Network error loading history");
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/history/insights", {
        credentials: "include",
      });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) {
        setError("Could not load insights");
        return;
      }
      setInsights((await res.json()) as Insights);
    } catch {
      setError("Network error loading insights");
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (view === "history") void loadHistory(historyQ);
    if (view === "insights") void loadInsights();
  }, [user, view, loadHistory, loadInsights]); // eslint-disable-line react-hooks/exhaustive-deps -- search is manual

  const loadFixture = useCallback(async (id: string) => {
    setError(null);
    setDiagnosis(null);
    setMeta(null);
    const res = await fetch(`/api/fixtures/${id}`, { credentials: "include" });
    if (res.status === 401) {
      setUser(null);
      return;
    }
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
        ...jsonCred,
        body: JSON.stringify({
          logText,
          fixtureId: activeFixture,
          mode: "auto",
        }),
      });
      const data = (await res.json()) as DiagnoseResponse & { error?: string };
      if (res.status === 401) {
        setUser(null);
        setError("Session expired — please log in again");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Diagnose failed");
        return;
      }
      setDiagnosis(data.diagnosis);
      setMeta(data.meta);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function openHistoryItem(id: string) {
    setSelectedId(id);
    setError(null);
    const res = await fetch(`/api/history/${id}`, { credentials: "include" });
    if (res.status === 401) {
      setUser(null);
      return;
    }
    if (!res.ok) {
      setError("History item not found");
      return;
    }
    const detail = (await res.json()) as {
      diagnosis: Diagnosis;
      meta: DiagnoseResponse["meta"];
    };
    setDiagnosis(detail.diagnosis);
    setMeta({ ...detail.meta, runId: id, fromCache: false });
    setView("diagnose");
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setLogText("");
    setDiagnosis(null);
    setMeta(null);
    setActiveFixture(null);
    setFixtures([]);
    setHistory([]);
    setInsights(null);
  }

  if (!authReady) {
    return (
      <div className="wrap">
        <p className="empty">Checking session…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  return (
    <div className="wrap">
      <header>
        <div className="header-row">
          <div className="badge">React · Express · Auth · History</div>
          <div className="user-bar">
            <span className="user-email">{user.email}</span>
            <button type="button" className="ghost small" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
        <h1>LogLens</h1>
        <p className="sub">
          Diagnose CI logs, keep a searchable history, and view simple insights —
          still drafts only, no auto actions.
        </p>
        <div className="view-tabs" role="tablist">
          {(
            [
              ["diagnose", "Diagnose"],
              ["history", "History"],
              ["insights", "Insights"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`tab ${view === id ? "active" : ""}`}
              aria-selected={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {view === "diagnose" && (
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
                setMeta(null);
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
                {loading ? "Diagnosing…" : "Diagnose"}
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setLogText("");
                  setDiagnosis(null);
                  setMeta(null);
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
                Structured output: cause, evidence, next steps, confidence. Human
                still decides what to do next.
              </p>
            ) : (
              <DiagnosisView diagnosis={diagnosis} meta={meta} />
            )}
          </section>
        </div>
      )}

      {view === "history" && (
        <section className="panel">
          <h2>Diagnosis history</h2>
          <p className="empty" style={{ marginBottom: "0.75rem" }}>
            Stored in SQLite per user. Search uses FTS (full-text) over cause /
            summary / log preview.
          </p>
          <form
            className="history-search"
            onSubmit={(e) => {
              e.preventDefault();
              void loadHistory(historyQ);
            }}
          >
            <input
              value={historyQ}
              onChange={(e) => setHistoryQ(e.target.value)}
              placeholder="Search causes, summaries…"
              aria-label="Search history"
            />
            <button className="primary" type="submit" disabled={historyLoading}>
              {historyLoading ? "…" : "Search"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setHistoryQ("");
                void loadHistory("");
              }}
            >
              Reset
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          {history.length === 0 && !historyLoading ? (
            <p className="empty">No runs yet — diagnose a log first.</p>
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`history-item ${selectedId === item.id ? "active" : ""}`}
                    onClick={() => void openHistoryItem(item.id)}
                  >
                    <span className="history-when">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                    <span className="history-cause">{item.likelyCause}</span>
                    <span className="history-meta">
                      <span className="pill">{item.provider}</span>
                      <span className="pill">{item.brain}</span>
                      {item.needsHumanReview && (
                        <span className="pill review">review</span>
                      )}
                      {item.ragWeak && (
                        <span className="pill review">rag weak</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "insights" && (
        <section className="panel">
          <h2>Insights</h2>
          <p className="empty" style={{ marginBottom: "0.75rem" }}>
            SQL aggregations over your history — BI-lite (no warehouse yet).
          </p>
          {insightsLoading && <p className="empty">Loading…</p>}
          {error && <p className="error">{error}</p>}
          {insights && !insightsLoading && (
            <div className="insights-grid">
              <div className="insight-stat">
                <div className="insight-value">{insights.totalRuns}</div>
                <div className="insight-label">Total runs</div>
              </div>
              <div className="insight-stat">
                <div className="insight-value">
                  {Math.round(insights.needsReviewRate * 100)}%
                </div>
                <div className="insight-label">
                  Needs review ({insights.needsReviewCount})
                </div>
              </div>
              <div className="insight-stat">
                <div className="insight-value">{insights.ragWeakCount}</div>
                <div className="insight-label">RAG weak</div>
              </div>
              <InsightTable
                title="By provider"
                rows={insights.byProvider.map((r) => [r.provider, r.count])}
              />
              <InsightTable
                title="By brain"
                rows={insights.byBrain.map((r) => [r.brain, r.count])}
              />
              <InsightTable
                title="By confidence"
                rows={insights.byConfidence.map((r) => [
                  r.confidence,
                  r.count,
                ])}
              />
              <InsightTable
                title="Top causes"
                rows={insights.topCauses.map((r) => [r.cause, r.count])}
                wide
              />
            </div>
          )}
        </section>
      )}

      <footer>
        Signed in · History in SQLite · cache skips repeat LLM for same log hash ·
        audit.jsonl via in-process queue
      </footer>
    </div>
  );
}

function InsightTable({
  title,
  rows,
  wide,
}: {
  title: string;
  rows: (string | number)[][];
  wide?: boolean;
}) {
  return (
    <div className={`insight-table ${wide ? "wide" : ""}`}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty">None yet</p>
      ) : (
        <table>
          <tbody>
            {rows.map(([label, count]) => (
              <tr key={String(label)}>
                <td>{label}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DiagnosisView({
  diagnosis,
  meta,
}: {
  diagnosis: Diagnosis;
  meta: DiagnoseResponse["meta"] | null;
}) {
  return (
    <dl className="diag">
      <dt>Provider</dt>
      <dd>
        <span className="pill">{diagnosis.provider}</span>
        {meta?.brain && (
          <>
            {" "}
            <span className="pill">{meta.brain}</span>
          </>
        )}
        {meta?.model && (
          <>
            {" "}
            <span className="pill">{meta.model}</span>
          </>
        )}
        {meta?.fellBackToMock && (
          <>
            {" "}
            <span className="pill review">fell back to mock</span>
          </>
        )}
        {meta?.fromCache && (
          <>
            {" "}
            <span className="pill">from cache</span>
          </>
        )}
        {meta?.runId && (
          <>
            {" "}
            <span className="pill">saved</span>
          </>
        )}
      </dd>
      {meta && (
        <>
          <dt>Meta</dt>
          <dd className="empty">
            mode={meta.mode} · {meta.latencyMs}ms
            {meta.truncated
              ? ` · truncated (${meta.truncateStrategy}, kept ${meta.keptErrorLines} err lines)`
              : ""}
            {meta.fallbackReason ? ` · ${meta.fallbackReason}` : ""}
          </dd>
        </>
      )}
      {meta?.truncated && (
        <>
          <dt>Context</dt>
          <dd>
            <span className="pill review">log truncated</span>{" "}
            <span className="pill">{meta.truncateStrategy}</span>
          </dd>
        </>
      )}
      {meta?.injectionSuspected && (
        <>
          <dt>Security</dt>
          <dd>
            <span className="pill review">
              untrusted log / injection suspected
            </span>
            {meta.injectionSignals?.length
              ? ` · ${meta.injectionSignals.join(", ")}`
              : ""}
          </dd>
        </>
      )}
      {meta && meta.ragChunkCount > 0 && (
        <>
          <dt>RAG</dt>
          <dd>
            {meta.ragWeak ? (
              <span className="pill review">weak retrieval</span>
            ) : (
              <span className="pill">runbooks hit</span>
            )}
            {meta.ragMode && (
              <>
                {" "}
                <span className="pill">{meta.ragMode}</span>
              </>
            )}
            {meta.ragEmbeddingProvider &&
              meta.ragEmbeddingProvider !== "none" && (
                <>
                  {" "}
                  <span className="pill">{meta.ragEmbeddingProvider}</span>
                </>
              )}{" "}
            top={meta.ragTopScore} · {meta.ragHitCount}/{meta.ragChunkCount}{" "}
            chunks
            {meta.ragSources?.length ? ` · ${meta.ragSources.join(", ")}` : ""}
          </dd>
        </>
      )}
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
        <span className={`pill ${diagnosis.confidence}`}>
          {diagnosis.confidence}
        </span>
        {diagnosis.needsHumanReview && (
          <>
            {" "}
            <span className="pill review">needs human review</span>
          </>
        )}
      </dd>
    </dl>
  );
}

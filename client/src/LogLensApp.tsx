import { useCallback, useEffect, useRef, useState } from "react";
import { AuthScreen, type AuthUser } from "./AuthScreen";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
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

/** A5 — parse one SSE block (`event:` + `data:`). */
function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

export function LogLensApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>("diagnose");
  const [fixtures, setFixtures] = useState<FixtureInfo[]>([]);
  const [logText, setLogText] = useState("");
  const [activeFixture, setActiveFixture] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [meta, setMeta] = useState<DiagnoseResponse["meta"] | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<"up" | "down" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [streamPhase, setStreamPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diagnoseAbort = useRef<AbortController | null>(null);

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
    setFeedbackRating(null);
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

  function onCancelDiagnose() {
    diagnoseAbort.current?.abort();
  }

  async function onDiagnose() {
    diagnoseAbort.current?.abort();
    const ac = new AbortController();
    diagnoseAbort.current = ac;

    setLoading(true);
    setError(null);
    setDiagnosis(null);
    setMeta(null);
    setFeedbackRating(null);
    setStreamPreview("");
    setStreamPhase("start");

    try {
      const res = await fetch("/api/diagnose/stream", {
        method: "POST",
        ...jsonCred,
        signal: ac.signal,
        body: JSON.stringify({
          logText,
          fixtureId: activeFixture,
          mode: "auto",
        }),
      });
      if (res.status === 401) {
        setUser(null);
        setError("Session expired — please log in again");
        return;
      }
      if (!res.ok || !res.body) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error || "Diagnose stream failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const parsed = parseSseBlock(part.trim());
          if (!parsed) continue;
          let payload: unknown = null;
          try {
            payload = JSON.parse(parsed.data);
          } catch {
            // Partial JSON pitfall: never treat bad/incomplete data as diagnosis
            continue;
          }
          if (parsed.event === "status") {
            const p = payload as { phase?: string; detail?: string };
            setStreamPhase(p.detail || p.phase || "…");
          } else if (parsed.event === "delta") {
            const d = payload as { text?: string };
            if (d.text) setStreamPreview((prev) => prev + d.text);
          } else if (parsed.event === "done") {
            const data = payload as DiagnoseResponse;
            setDiagnosis(data.diagnosis);
            setMeta(data.meta);
            setStreamPreview("");
            setStreamPhase(null);
            gotDone = true;
          } else if (parsed.event === "error") {
            const e = payload as { error?: string };
            setError(e.error || "Stream error");
          } else if (parsed.event === "cancelled") {
            setError("Cancelled");
            setStreamPhase(null);
          }
        }
      }

      if (!gotDone && !ac.signal.aborted) {
        setError((prev) => prev ?? "Stream ended before a complete diagnosis");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Cancelled");
        setStreamPhase(null);
      } else {
        setError("Network error");
      }
    } finally {
      setLoading(false);
      diagnoseAbort.current = null;
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
      feedback?: { rating: "up" | "down" } | null;
    };
    setDiagnosis(detail.diagnosis);
    setMeta({ ...detail.meta, runId: id, fromCache: false });
    setFeedbackRating(detail.feedback?.rating ?? null);
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
            <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
              Log out
            </Button>
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
              <Button
                disabled={loading || !logText.trim()}
                onClick={() => void onDiagnose()}
              >
                {loading ? "Streaming…" : "Diagnose"}
              </Button>
              {loading && (
                <Button variant="danger" onClick={onCancelDiagnose}>
                  Cancel
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setLogText("");
                  setDiagnosis(null);
                  setMeta(null);
                  setFeedbackRating(null);
                  setStreamPreview("");
                  setStreamPhase(null);
                  setActiveFixture(null);
                }}
              >
                Clear
              </Button>
            </div>
            {error && <p className="error">{error}</p>}
          </section>

          <section className="panel">
            <h2>Draft diagnosis</h2>
            {loading && streamPhase && (
              <p className="empty stream-phase">phase: {streamPhase}</p>
            )}
            {loading && streamPreview && (
              <pre className="stream-preview">{streamPreview}</pre>
            )}
            {!diagnosis && !loading && !streamPreview ? (
              <p className="empty">
                Structured output streams in; only the final event is a real
                diagnosis. Cancel anytime. Human still decides what to do next.
              </p>
            ) : null}
            {diagnosis ? (
              <DiagnosisView
                diagnosis={diagnosis}
                meta={meta}
                feedbackRating={feedbackRating}
                onFeedback={setFeedbackRating}
              />
            ) : null}
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
            <Input
              value={historyQ}
              onChange={(e) => setHistoryQ(e.target.value)}
              placeholder="Search causes, summaries…"
              aria-label="Search history"
            />
            <Button type="submit" disabled={historyLoading}>
              {historyLoading ? "…" : "Search"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setHistoryQ("");
                void loadHistory("");
              }}
            >
              Reset
            </Button>
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
                      <Badge>{item.provider}</Badge>{" "}
                      <Badge tone="accent">{item.brain}</Badge>
                      {item.needsHumanReview && (
                        <>
                          {" "}
                          <Badge tone="warn">review</Badge>
                        </>
                      )}
                      {item.ragWeak && (
                        <>
                          {" "}
                          <Badge tone="danger">rag weak</Badge>
                        </>
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
            Cost is a proxy, not a bill.
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
              {insights.costEstimate && (
                <div className="insight-stat">
                  <div className="insight-value">
                    ${insights.costEstimate.estimatedUsd.toFixed(4)}
                  </div>
                  <div className="insight-label">
                    Est. LLM $ ({insights.costEstimate.openaiRuns} openai ·{" "}
                    {insights.costEstimate.mockRuns} mock)
                  </div>
                </div>
              )}
              {insights.costEstimate && (
                <p className="empty" style={{ gridColumn: "1 / -1" }}>
                  {insights.costEstimate.note}
                </p>
              )}
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
  feedbackRating,
  onFeedback,
}: {
  diagnosis: Diagnosis;
  meta: DiagnoseResponse["meta"] | null;
  feedbackRating: "up" | "down" | null;
  onFeedback: (r: "up" | "down" | null) => void;
}) {
  const [approveMsg, setApproveMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  async function sendFeedback(rating: "up" | "down") {
    const runId = meta?.runId;
    if (!runId) {
      setFeedbackMsg("Save a diagnosis first (run Diagnose) to rate it.");
      return;
    }
    setFeedbackBusy(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/history/${runId}/feedback`, {
        method: "POST",
        ...jsonCred,
        body: JSON.stringify({ rating }),
      });
      const data = (await res.json()) as {
        error?: string;
        evalCandidate?: string | null;
      };
      if (!res.ok) {
        setFeedbackMsg(data.error || "Feedback failed");
        return;
      }
      onFeedback(rating);
      setFeedbackMsg(
        rating === "down"
          ? data.evalCandidate ||
              "Thanks — miss logged for eval candidates."
          : "Thanks — marked helpful.",
      );
    } catch {
      setFeedbackMsg("Network error on feedback");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function onApprove(
    toolCallId: string,
    approved: boolean,
    draft: Record<string, unknown>,
  ) {
    setApprovingId(toolCallId);
    setApproveMsg(null);
    try {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        ...jsonCred,
        body: JSON.stringify({ toolCallId, approved, draft }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setApproveMsg(data.error || "Approve failed");
        return;
      }
      setApproveMsg(data.message || (approved ? "Approved" : "Rejected"));
    } catch {
      setApproveMsg("Network error on approve");
    } finally {
      setApprovingId(null);
    }
  }

  const agent = meta?.agent;

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
        {meta?.streamed && (
          <>
            {" "}
            <span className="pill">streamed</span>
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
      {agent?.enabled && (
        <>
          <dt>Agent</dt>
          <dd>
            <span className="pill">max {agent.maxSteps} steps</span>{" "}
            {agent.shadowMode && <span className="pill">shadow</span>}
            {agent.refusedSignals?.length > 0 && (
              <>
                {" "}
                <span className="pill review">
                  refused: {agent.refusedSignals.join(", ")}
                </span>
              </>
            )}
            <p className="empty" style={{ margin: "0.4rem 0 0" }}>
              {agent.note}
            </p>
            <ol className="agent-trail">
              {agent.toolCalls.map((c) => (
                <li key={c.id}>
                  <code>
                    #{c.step} {c.tool}
                  </code>{" "}
                  <span className="pill">{c.sideEffect}</span>
                  {c.reason ? ` — ${c.reason}` : ""}
                  {c.tool === "grep_log" &&
                  Array.isArray(c.result.hits) &&
                  (c.result.hits as string[]).length > 0 ? (
                    <div className="empty">
                      hits: {(c.result.hits as string[]).slice(0, 2).join(" · ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </dd>
        </>
      )}
      {agent?.pendingApprovals?.length ? (
        <>
          <dt>Write tools</dt>
          <dd>
            {agent.pendingApprovals.map((p) => (
              <div key={p.id} className="agent-approve">
                <div>
                  <span className="pill review">{p.status}</span>{" "}
                  <code>{p.tool}</code>
                </div>
                <pre className="agent-draft">
                  {String(p.draft?.title || "")}
                  {"\n\n"}
                  {String(p.draft?.body || "").slice(0, 400)}
                </pre>
                <div className="agent-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={approvingId === p.id}
                    onClick={() => void onApprove(p.id, true, p.draft)}
                  >
                    Approve (shadow)
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={approvingId === p.id}
                    onClick={() => void onApprove(p.id, false, p.draft)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {approveMsg && <p className="empty">{approveMsg}</p>}
          </dd>
        </>
      ) : null}
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
      <dt>Feedback</dt>
      <dd>
        <div className="feedback-row">
          <Button
            size="sm"
            variant={feedbackRating === "up" ? "primary" : "ghost"}
            disabled={feedbackBusy || !meta?.runId}
            onClick={() => void sendFeedback("up")}
          >
            Helpful
          </Button>
          <Button
            size="sm"
            variant={feedbackRating === "down" ? "danger" : "ghost"}
            disabled={feedbackBusy || !meta?.runId}
            onClick={() => void sendFeedback("down")}
          >
            Miss
          </Button>
        </div>
        {!meta?.runId && (
          <p className="empty" style={{ marginTop: "0.35rem" }}>
            Rate after a saved run (Diagnose stores history).
          </p>
        )}
        {feedbackMsg && (
          <p className="empty" style={{ marginTop: "0.35rem" }}>
            {feedbackMsg}
          </p>
        )}
      </dd>
    </dl>
  );
}

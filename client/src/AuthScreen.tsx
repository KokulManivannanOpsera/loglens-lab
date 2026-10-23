import { useState, type FormEvent } from "react";

export type AuthUser = { id: string; email: string };

type Mode = "login" | "signup";

type Props = {
  onAuthed: (user: AuthUser) => void;
};

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok) {
        setError(data.error || `${mode} failed`);
        return;
      }
      if (!data.user) {
        setError("No user returned");
        return;
      }
      onAuthed(data.user);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap auth-wrap">
      <header>
        <div className="badge">Auth · cookie session</div>
        <h1>LogLens</h1>
        <p className="sub">
          Sign up or log in to diagnose CI logs. Passwords are hashed on the
          server; the session cookie is httpOnly (not readable by JS).
        </p>
      </header>

      <section className="panel auth-panel">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "tab active" : "tab"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "tab active" : "tab"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <p className="hint">At least 8 characters. Lab store: server/data/users.json</p>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

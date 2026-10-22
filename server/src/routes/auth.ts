import { Router } from "express";
import {
  clearSessionCookie,
  hashPassword,
  requireAuth,
  setSessionCookie,
  signSession,
  validateCredentials,
  verifyPassword,
  verifySession,
  COOKIE_NAME,
} from "../lib/auth.js";
import {
  createUser,
  findUserByEmail,
  publicUser,
} from "../lib/users.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const password = String(req.body?.password ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash);
    const token = await signSession(user);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }
    res.status(500).json({ error: "Could not create account" });
  }
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "");
  const password = String(req.body?.password ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = await signSession(user);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await verifySession(token);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
});

/** Optional: confirm requireAuth wiring in tests */
authRouter.get("/whoami", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

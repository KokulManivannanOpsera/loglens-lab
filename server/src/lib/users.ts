import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

type Store = { users: UserRecord[] };

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(serverRoot, "data");
const storePath = path.join(dataDir, "users.json");

function readStore(): Store {
  if (!existsSync(storePath)) {
    return { users: [] };
  }
  try {
    const raw = readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeStore(store: Store): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(email: string): UserRecord | undefined {
  const normalized = normalizeEmail(email);
  return readStore().users.find((u) => u.email === normalized);
}

export function findUserById(id: string): UserRecord | undefined {
  return readStore().users.find((u) => u.id === id);
}

export function createUser(email: string, passwordHash: string): UserRecord {
  const store = readStore();
  const normalized = normalizeEmail(email);
  if (store.users.some((u) => u.email === normalized)) {
    throw new Error("EMAIL_TAKEN");
  }
  const user: UserRecord = {
    id: randomUUID(),
    email: normalized,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  writeStore(store);
  return user;
}

export function publicUser(user: UserRecord): { id: string; email: string } {
  return { id: user.id, email: user.email };
}

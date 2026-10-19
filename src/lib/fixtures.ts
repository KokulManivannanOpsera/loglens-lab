import { readFileSync, readdirSync } from "fs";
import path from "path";

const fixturesDir = path.join(process.cwd(), "fixtures", "logs");

export type FixtureInfo = {
  id: string;
  label: string;
};

export function listFixtures(): FixtureInfo[] {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => ({
      id: f.replace(/\.txt$/, ""),
      label: f.replace(/\.txt$/, "").replace(/-/g, " "),
    }));
}

export function readFixture(id: string): string | null {
  const safe = id.replace(/[^a-z0-9-]/gi, "");
  if (!safe) return null;
  try {
    return readFileSync(path.join(fixturesDir, `${safe}.txt`), "utf8");
  } catch {
    return null;
  }
}

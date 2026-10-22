# Flaky tests and timeouts

## What it looks like
`flaky`, `ETIMEDOUT`, `Timeout of Nms exceeded`, or intermittent failures that pass on retry.

## Likely cause
Network or timing-sensitive tests, shared mutable state, undersized CI runners, or external dependencies that are slow under load — not always a pure logic bug.

## What to do
1. Check whether the test is known-flaky in the team knowledge base.
2. Re-run once before deep debugging if the signal is timeout-only.
3. Look for sleeps, real network calls, or missing test isolation.
4. Confirm whether production traffic shows the same timeout before blaming app logic.

## When you do not know
If the log only shows a generic timeout with no test name, keep confidence low and mark for human review.

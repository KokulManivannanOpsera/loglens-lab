# Assertion failures in CI

## What it looks like
Logs often contain `AssertionError`, `expected X to equal Y`, `FAIL`, or `N failing`. The stack usually points at a test file and a related commit.

## Likely cause
A unit or integration test expectation no longer matches the code under test — often from a recent commit that changed behavior without updating the test (or the reverse).

## What to do
1. Open the failing test file from the stack trace.
2. Diff the related commit against the assertion and the production code.
3. Fix either the code or the test; do not silence the failure.
4. Draft any PR comment only after a human reviews the diagnosis (draft ≠ action).

## When you do not know
If there is no stack trace and no failing test name, say you do not know the root cause. Do not invent a test name.

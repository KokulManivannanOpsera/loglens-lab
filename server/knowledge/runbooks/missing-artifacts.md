# Missing CI log artifacts

## What it looks like
Messages like `log artifact not found`, HTTP `404`, or `Skipping log download`. The workflow run may exist while the log body is empty or unavailable.

## Likely cause
Artifacts expired, were never uploaded, permissions blocked download, or a previous step failed before logs were published.

## What to do
1. Re-fetch workflow artifacts from the CI UI or API.
2. Check artifact retention settings and upload steps in the workflow.
3. Do not invent a failing test name when the log content is missing.
4. Escalate if artifacts stay missing after a re-fetch — needs human review.

## When you do not know
Without the actual log body, refuse to guess a root cause beyond "artifact unavailable."

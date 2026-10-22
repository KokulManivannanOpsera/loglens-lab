# Stale runbooks (RAG limitation)

## What it looks like
Retrieval returns a confident-sounding runbook chunk, but the team's process has changed (new CI system, renamed jobs, deprecated steps).

## Likely cause
RAG only knows what is in the knowledge files. Docs can be outdated relative to production.

## What to do
1. Treat runbook hits as hints, not ground truth.
2. Prefer evidence lines from the actual CI log over runbook prose.
3. If log and runbook disagree, trust the log and flag needsHumanReview.
4. Update the runbook in git when process changes — retrieval quality depends on fresh docs.

## When you do not know
If retrieval is weak or contradictory, say you do not know rather than forcing a runbook narrative.

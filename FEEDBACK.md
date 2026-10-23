# A3c — Human feedback loop

Rate drafts so misses become future eval cases. **Thumbs do not auto-change the model.**

```text
Diagnose → saved runId
        → Helpful (up)  → store rating
        → Miss (down)   → store rating + append evals/feedback-candidates.jsonl
        → human promotes a candidate → goldens.json → npm run eval
```

## API

```bash
POST /api/history/:runId/feedback
{ "rating": "up" | "down", "note": "optional" }
```

Auth required. Down writes one JSON line to `server/evals/feedback-candidates.jsonl`.

## Promote a miss to a golden

1. Open `feedback-candidates.jsonl`  
2. Pick a bad diagnosis  
3. Add a case to `evals/goldens.json` with clear `expect`  
4. `npm run eval` — must stay green  

Never auto-merge candidates into goldens (avoids poisoning the suite).

## Prove aloud

1. Diagnose → Helpful / Miss buttons appear (saved run)  
2. Miss → new line in `feedback-candidates.jsonl`  
3. Why promote by hand? Evals are the product contract — humans gate quality.  

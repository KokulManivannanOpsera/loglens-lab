# BRING — Design (tokens + wireframe)

**Role:** Design — intentional UI system, not a full design org.

## Tokens (`client/src/index.css` `:root`)

| Token | Use |
|-------|-----|
| `--bg`, `--panel`, `--code` | Surfaces |
| `--text`, `--muted` | Typography |
| `--accent`, `--accent-dim` | Primary actions |
| `--warn`, `--danger` | Review / errors |
| `--border` | Dividers |
| `--radius-sm/md/lg` | Corners |
| `--space-*` | Spacing scale |
| `--font-sans`, `--font-mono` | Type |

Change brand color in one place (`--accent`) — components follow.

## Wireframe (product surfaces)

```text
┌─ LogLens ─────────────────────────────────────────┐
│  [Diagnose] [History] [Insights]     user · logout │
├──────────────────────┬────────────────────────────┤
│ Log input            │ Draft diagnosis            │
│ fixtures · textarea  │ stream preview → result    │
│ [Diagnose] [Cancel]  │ agent trail · approve      │
└──────────────────────┴────────────────────────────┘

History: search · list of past drafts
Insights: stats · cost proxy · breakdown tables
```

Optional: paste an Excalidraw/Figma link here when you draw a denser mock.

## Prove aloud

1. Change `--accent` → buttons/badges shift  
2. Name the three product tabs from the wireframe  

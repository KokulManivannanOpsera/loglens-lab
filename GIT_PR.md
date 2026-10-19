# D1 cheat sheet — Git branch + PR

## Why
`main` stays known-good. Work on a **branch**. A **PR** is “please merge after we look at the diff.”

## Commands
```bash
git checkout main && git pull
git checkout -b feature/short-name
# ... edit ...
git add .
git commit -m "Why this change exists"
git push -u origin HEAD
gh pr create   # or open the GitHub link
# after merge:
git checkout main && git pull
```

## Rules
1. Don’t develop only on `main` once others/CI depend on it  
2. One PR ≈ one idea  
3. Read your own diff before merge  
4. After merge: delete branch, pull `main`

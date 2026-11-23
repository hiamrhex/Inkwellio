# Runbook: Disk Hygiene and Worktree Management

**Audience:** Inkwellio engineering team  
**Target Environment:** Windows 11 / PowerShell / pnpm  
**Reference Baseline:** Drive C free space threshold >= 2.6 GB  

---

## 1. Why Disk Hygiene Matters

Inkwellio uses Next.js Turbopack, PostgreSQL 17 containers, and multi-agent Git worktrees. Because Windows systems can experience disk space constraints, strict rules prevent runaway consumption:
- **Never install heavy testing browsers locally:** Playwright and Lighthouse Chromium instances consume ~1 GB each. Run them exclusively in GitHub Actions CI runners.
- **Never duplicate node_modules across worktrees:** pnpm hardlinks from the global content-addressable store (`%LOCALAPPDATA%\pnpm\store\v11`), ensuring shared packages take zero extra disk clusters.

---

## 2. Checking Free Space on Windows

Always verify available disk space before starting builds or new worktrees:

```powershell
# Quick check via PowerShell drive provider (in GB)
[math]::round((Get-PSDrive C).Free / 1GB, 2)

# Precise check via .NET DriveInfo (in GB)
[System.IO.DriveInfo]::GetDrives()[0].AvailableFreeSpace / 1GB
```

If free space drops below **2.0 GB**, immediately run the cleanup steps in Section 4.

---

## 3. Safe Git Worktree Operations

### Listing Active Worktrees
```powershell
git worktree list
```

### Adding a Worktree
Always create worktrees inside `.worktrees/` so they are automatically ignored by Git and ESLint:
```powershell
git worktree add .worktrees/<branch-name> <branch-name>
```

### Linking Dependencies
Install frozen dependencies using pnpm (hardlinked from store):
```powershell
pnpm --dir .worktrees/<branch-name> install --frozen-lockfile
```

### Removing a Finished Worktree
When work on a branch is merged:
```powershell
# 1. Remove the worktree folder and git registration
git worktree remove .worktrees/<branch-name>

# 2. Prune any stale worktree administrative references
git worktree prune
```

---

## 4. Emergency Disk Reclamation

If disk space is low, execute these safe cleanup commands:

### A. Remove Next.js Build Artifacts
Build caches (`.next/`) can consume 300–600 MB per workspace:
```powershell
Remove-Item -Recurse -Force apps/web/.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .worktrees/*/.next -ErrorAction SilentlyContinue
```

### B. Prune Unreferenced pnpm Store Packages
Removes packages in the content-addressable store that are no longer used by any project:
```powershell
pnpm store prune
```

### C. Clear Tooling and Lint Caches
```powershell
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
Remove-Item -Force .eslintcache -ErrorAction SilentlyContinue
```

### D. Clear Stale Gate and Git Locks
If a command crashed and left an orphaned lock file:
```powershell
# Shared gate lock across all worktrees (.git/inkwellio-gate.lock)
Remove-Item -Recurse -Force (Join-Path (git rev-parse --git-common-dir) "inkwellio-gate.lock") -ErrorAction SilentlyContinue

# Git index lock
Remove-Item -Force (Join-Path (git rev-parse --git-common-dir) "index.lock") -ErrorAction SilentlyContinue
```

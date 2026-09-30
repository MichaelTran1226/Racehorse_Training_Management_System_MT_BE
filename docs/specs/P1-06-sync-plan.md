# P1-06 GitHub sync plan

- Target repository: `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`
- Remote: `https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git`
- Branch: `feat/37-audit-trail`
- Traceability: `Refs MichaelTran1226/Racehorse_Training_Management_System_MT_BE#37`, FR-021, API-017.
- FE is a separate branch/commit in `Racehorse_Training_Management_System_MT_FE`.
- No push, PR, issue comment or Project mutation performed by this run. GitHub CLI/MCP
  unavailable. Do not infer a merge from the issue's closed state shown on GitHub.
- Local task checkbox remains unchecked because the task list requires both repos merged.

After reviewing the local commits, push each repository separately:

```powershell
git -C E:/FPT/Se_5/MINH/Racehorse_Training_Management_System_MT_BE push -u origin feat/37-audit-trail
git -C E:/FPT/Se_5/MINH/Racehorse_Training_Management_System_MT_FE push -u origin feat/37-audit-trail
```

PR title: `feat: implement P1-06 audit trail query and transaction-safe account history`

PR summary: Add permission-gated filtered/paginated audit queries and request metadata.
Account edits, status, permissions and deletion persist history atomically; row locking
keeps before-values accurate under concurrent writers. Link the FE companion PR.

Validation: attach the delivery reports from both repos. Run the opt-in PostgreSQL suite
and real FE→BE smoke test before claiming production/database integration. Retain explicit
Sonar gate limitation. Rollback is code revert; no schema/data deletion required.

AGENTS.md
PROJECT RULES

Before modifying code, the agent MUST read:

docs/rules/00-core-rules.md

Then read only the rule files relevant to the current task.

Examples:

Security task:

docs/rules/00-core-rules.md
docs/rules/02-security.md
docs/rules/06-api.md

React task:

docs/rules/00-core-rules.md
docs/rules/04-nextjs.md
docs/rules/07-react.md

Database task:

docs/rules/00-core-rules.md
docs/rules/05-supabase.md
docs/rules/08-database.md

Refactor task:

docs/rules/00-core-rules.md
docs/rules/12-refactor.md
relevant docs/refactor/\*.md
MANDATORY WORKFLOW

Before coding:

Read applicable rules.
Inspect the existing implementation.
Search for consumers.
Identify dependencies.
Define the smallest safe change.

During coding:

Modify only the requested scope.
Do not invent APIs, tables, types or business rules.
Preserve existing behavior unless explicitly instructed otherwise.
Do not introduce unnecessary abstractions.
Do not weaken security.

After coding:

Run typecheck.
Run tests when available.
Run build when relevant.
Run lint when available.
Review git diff.
Report files changed.
Report validation results.
Report risks.
Report OUT OF SCOPE findings.
STOP CONDITIONS

STOP and ask for review when:

authentication changes are required;
authorization changes are required;
roles are ambiguous;
database schema changes are required;
destructive migrations are required;
production data could be affected;
secrets are involved;
an API contract must change;
business behavior is ambiguous;
documentation conflicts with the real code.
IMPORTANT

Do not solve unrelated problems.

If you discover another issue, report:

OUT OF SCOPE

Do not modify it unless explicitly requested.

QUALITY BAR

The final implementation must be:

secure;
typed;
minimal;
testable;
maintainable;
consistent with the existing project;
documented when architecture or behavior changes.

When uncertain:

DO NOT GUESS.
STOP AND ASK.

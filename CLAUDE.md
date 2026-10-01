# CLAUDE.md — Zengxin Ops Portal (誠馨日照營運入口)

Single source of truth for this project. Claude Code reads this file automatically; Claude chat/Cowork
should be pointed at `docs/INDEX.md` (and the repo) so every surface shares the same domain knowledge.

## What this is
- A role-based operations portal for a multi-site long-term-care / day-care operator in Taiwan.
- **Goal (owner's stated):** a fully running production product that can serve 300+ employees — not a demo.
- **Today (v2.1):** a single-file static prototype (`ltc-portal.html`) with mock data. No backend, no auth,
  no database, no persistence. Jest unit + Playwright e2e tests exist (`npm test`).
- Roadmap (v2.0 spec): short term admin core (MVP target end of Oct 2026) → mid term business data integration → long term risk and quality management.
- **Sources only:** content must come from the 9/20 meeting minutes, the requirements deck, the v2.0 spec or the owner's direct statements. Anything else is marked 待確認. No real personal names. Scope: 誠馨、誠芯、牛津 (greater Hsinchu) + 共用行政.

## Canonical repo rule
- **This is the only active repo for this project.** `ltc-ops-portal` was an older predecessor (Sept 7–16) and is
  superseded; do not add work there.
- Everything for the project — code, docs, meeting notes, deliverable exports, links — lives under this repo's
  `docs/` tree (see `docs/INDEX.md`). New chats/sessions should start by reading that index.

## Working conventions
- Bilingual: Traditional Chinese (zh-Hant) first, English second. Stakeholder-facing outputs default to Traditional Chinese.
- **Mock data only.** Never commit real employee records, salaries, IDs, or client financials.
- **Client-name hygiene:** the real operator name appears in the prototype. Anything shared publicly must use the
  fictional-operator build (the predecessor repo had a generator script, `scripts/make-public.py`; porting it here is an open task — see `docs/DECISIONS.md`).
- Treat the engagement like a paying client: scope in writing, change requests logged in `docs/DECISIONS.md`.
- Run `npm test` before opening a PR. Don't push straight to `main` (main auto-deploys to GitHub Pages).

## Stakeholder roles (names intentionally omitted from the repo)
HR lead (owns employee data), system administrator, infrastructure/hardware owner (NAS + firewall),
owner/decision-maker across the companies.

## Systems in scope
- 104 attendance platform — current subscription, candidate to replace (Plan B) or keep with CSV/Excel imports (Plan A).
- 仁寶 care-management system — integration planned (API / webhook / CSV still undecided).
- Compliance: Taiwan 個資法 (Personal Data Protection Act).

## Known inconsistencies to resolve (do not assume — ask the owner)
See `docs/DECISIONS.md`.

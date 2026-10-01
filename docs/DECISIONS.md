# Decision log and open questions

Format: `YYYY-MM-DD — decision — why / who decided`. Keep one line each.

## Decided
- 2026-09-30 — This repo is the single canonical repo; `ltc-ops-portal` is archived as a predecessor.

## Open (resolve with the client before building on them)
1. **Number of sites:** the prototype README says 2 sites; project notes say 3 companies and 7 offices. Which is the real v1 scope?
2. **104 usage:** which 104 modules are actually in use? (Drives Plan A "keep 104 + CSV import" vs Plan B "replace 104".)
3. **仁寶 integration:** API, webhook, or CSV export?
4. **Roles:** confirm the 9-tier role structure and data-scoping rules (cross-site director access, payroll visibility, leave approval levels).
5. **Hosting/data residency:** who owns infrastructure, where does production data live, how is 個資法 compliance handled?
6. **ROI framing:** savings from retiring 104 are modest — define the business case on other value (hidden HR labor, reporting, integration).
7. **Production path:** the prototype is static HTML. Choose stack, auth, database, and hosting for the 300+ employee build.

## Repo hygiene tasks
- [ ] Set this repo to **private** (or stop publishing the real operator name via Pages) — owner action in GitHub settings.
- [ ] Port the fictional-operator public build (`make-public.py`) from the archived predecessor, then publish only that build.
- [ ] Fix/confirm the GitHub Pages deploy workflow (failures were reported around Sept 22).
- [ ] Export existing Word deliverables from past chats into `docs/deliverables/`.

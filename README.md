# LLM Eval CI/CD Pipeline

A Node.js/Express backend + static HTML frontend for running lightweight,
heuristic-based LLM response evaluations (faithfulness, hallucination,
coherence, conciseness, safety) and viewing results on a dashboard.

## Post-submission updates

After initial submission, the following issues were identified and fixed:

- **Authentication**: fixed a broken backend URL and a response-field
  mismatch that silently blocked all logins; added a guard so the dashboard
  redirects unauthenticated users instead of loading with placeholder data.
- **Dashboard integrity**: the dashboard previously showed hardcoded sample
  metrics (scores, pass/fail verdicts, model comparisons) even when zero
  evaluations had been run. It now returns genuinely empty state until real
  evaluation data exists in the database.

This section will be updated as further fixes land.

## Setup

```bash
npm install
cp .env.example .env   # then fill in real values
npm start               # runs on http://localhost:5000
```

Open `frontend/src/authentication/Signup.html` in a browser (or serve the
`frontend` folder with a static file server) to create an account, then log
in and view the dashboard.

## Running tests

```bash
npm test
```

## Architecture

- `backend-core/server.js` — Express app, CORS config, route registration
- `backend-core/authentication/` — signup/login/forgot-password + eval run endpoint
- `backend-core/dashboard/` — dashboard metrics + evaluation-detail endpoints
- `backend-core/utils/evalEngine.js` — the actual evaluation logic (real, not an LLM judge — see below)
- `frontend/src/` — plain HTML/JS pages, no build step

## Evaluation methodology (please read before trusting scores)

This project does **not** call any external LLM to grade responses (no
DeepEval, Ragas, or Gemini API calls are wired up, despite package names in
`package.json` suggesting otherwise). All metrics in `evalEngine.js` are
**lightweight, deterministic heuristics**:

- **Faithfulness / Hallucination**: lexical word-overlap ratio between the
  response and the provided context. A response with extra, unlisted (even
  if true) detail will score lower — this is a known limitation of a
  bag-of-words approach, not a bug.
- **Coherence**: fraction of sentences with 3+ words.
- **Conciseness**: unique-word ratio with a length penalty.
- **Safety**: a small flagged-keyword list.

Treat these as a rough, transparent starting point — not a substitute for a
real DeepEval/Ragas/G-Eval pipeline or human review.

## Known limitations / not yet implemented

- **Langfuse and Arize Phoenix dashboard panels are still mock data.**
  Langfuse tracing calls are wired up in code but fall back to fake project
  keys unless you set real ones in `.env`. Phoenix has no real integration.
- **CI/CD status table, prompt breakdown table, and live log stream** on the
  dashboard are static/simulated, not backed by real GitHub Actions or
  request logs.
- **Forgot Password** confirms whether an email exists but does not send a
  real reset email or generate a usable reset token yet.
- Password hashing uses bcrypt for all new/rotated passwords. Accounts
  created before this change are migrated automatically (transparently
  rehashed to bcrypt) the next time they log in successfully.

# LLM Eval CI/CD Pipeline

A small LLM evaluation tool. You give it a prompt and a correct answer
(ground truth). Gemini answers the prompt, a second Gemini call acts as a
judge and checks the answer against the ground truth, the scores are saved in
Supabase, and a live dashboard shows the pass/fail history.

- Dashboard: https://llm-eval-cicd-pipeline.vercel.app (create an account on the Signup page)
- Backend API: https://llm-eval-backend-v2.onrender.com

Both run on free tiers. The backend sleeps when idle, so the first request
can take up to 50 seconds.

## How it works

1. You enter a prompt and a ground truth on the dashboard and click **Run Evaluation**.
2. The backend asks Gemini (`gemini-3.1-flash-lite`) to answer the prompt.
3. A second Gemini call (the judge) scores how well the answer matches the
   ground truth, from 0 to 1. This is the **faithfulness** score.
4. Three rule-based checks add coherence, conciseness and safety scores.
5. **Accuracy** is the average of these four scores. A run **PASSES at 90 or above**.
6. The result is saved in the Supabase table `evaluation_logs`.
7. The dashboard reads the table and shows totals, pass/fail history, a trend
   chart, quality gates and a model comparison.

## Scoring (read before trusting the numbers)

- **Faithfulness**: judged by Gemini against the ground truth. If the judge
  is unavailable, the app falls back to a simple word-overlap check. The CI
  gate does not allow this fallback.
- **Hallucination**: derived from faithfulness, as (1 - faithfulness) x 100.
  It is only available when a ground truth is given.
- **Coherence**: share of sentences that have 3 or more words.
- **Conciseness**: unique-word ratio, with a penalty for very long answers.
- **Safety**: checks the **prompt** (not the answer) for a short list of
  injection phrases.
- **Accuracy is a composite average, not classic accuracy.** Only
  faithfulness checks facts. The other three are simple rules.

## Run it locally

    npm install
    cp .env.example .env   # then fill in real values
    npm start              # runs on http://localhost:5000

Environment variables used by the backend: `GEMINI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`.

You need a Supabase table named `evaluation_logs` with these columns: id,
created_at, prompt_text, response_output, model, model_name, pipeline,
accuracy, geval_cot_score, hallucination_score, faithfulness_score,
answer_relevance, security_score, log_level, message. (The column
`answer_relevance` stores the conciseness score.)

## API

- `POST /api/eval/run` with body `{ "prompt": "...", "groundTruth": "...", "dryRun": false }`.
  Returns the answer, the scores and a verdict (PASSED or FAILED).
  With `"dryRun": true` the result is not saved (used by the CI gate).
- `GET /api/dashboard/metrics`: totals and average accuracy.
- `GET /api/dashboard/evaluation-details`: data for all dashboard panels.
- `GET /api/v1/system/status`: readiness check.

## Tests and CI

    npm test

- `tests/eval.test.js`: 5 unit tests for the scoring logic (no network needed).
- `.github/workflows/eval-cicd.yml` runs on every push and pull request to `main`:
  1. Unit tests.
  2. `scripts/ci-eval-gate.js`: sends a labeled test set of 10 cases to the
     live backend (5 with a correct ground truth that should PASS, 5 with a
     deliberately wrong one that should FAIL).
- The build **fails** if fewer than 80% of cases get the expected verdict,
  if any case errors, or if the judge is unavailable.
- The gate needs a GitHub secret named `EVAL_GATEWAY_URL` set to the backend URL.
- It was checked in both directions: it passed 10 out of 10 against the live
  backend, and it failed the build when the secret pointed to a wrong URL.
  A run can also fail when Gemini is overloaded. The gate retries each case
  up to 3 times before it counts the case as an error.
- `.github/workflows/keep-alive.yml` calls the backend every 3 days so the free
  backend and database are less likely to go idle and pause.

## Project structure

- `backend-core/server.js`: Express app, CORS, routes
- `backend-core/authentication/`: signup, login, forgot-password, and the eval run endpoint
- `backend-core/dashboard/`: dashboard endpoints
- `backend-core/utils/evalEngine.js`: Gemini calls, judge, and scoring
- `frontend/src/`: plain HTML and JS pages, no build step
- `scripts/ci-eval-gate.js`, `tests/`, `.github/workflows/`: CI

## Post-submission updates

After the initial submission, these issues were found and fixed:

- **Authentication**: fixed a broken backend URL and a response-field
  mismatch that blocked all logins. The dashboard now redirects users who are
  not logged in.
- **Fake evaluation engine**: the earlier engine returned the same score for
  every answer. It was replaced with real scoring and an LLM judge. A wrong
  fact (for example "The capital of France is Berlin") now FAILS.
- **Dashboard**: it used to show hardcoded sample data. All numbers now come
  from the database, and the dashboard shows an empty state when there are no
  runs. Panels that had no real data source (Langfuse, Phoenix, token counts,
  fake commit counts, simulated logs) were removed.
- **Persistence**: evaluations were only kept in server memory and were lost
  when the free server restarted. They are now saved in Supabase.
- **Run Evaluation button** added to the dashboard.
- **CI gate**: the old gate called localhost and always passed. It was
  replaced with the real gate described above.
- **CI gate changes**: the gate now retries a failed Gemini call 3 times
  (waits of 10, 20 and 30 seconds). If Gemini still returns an error (503), the
  backend saves nothing for that case, and the gate counts it as an error and
  fails the build. The gate has a 25 minute timeout. An empty Gemini answer or a
  missing API key is now treated as an error too. Some CI runs failed because
  of Gemini 503 errors and passed on re-run. The cause is not confirmed.
- **Dashboard order bug**: logs are now sorted by time, so the "latest run" is correct.
- **Dead code removed**: unused telemetry and GitHub endpoints, plus unused
  helper files (brute-force check, crypto helper, telemetry tracker), were deleted.
  `node-fetch` is now declared in `package.json`.

## Known limitations

- **`POST /api/eval/run` has no login or API key.** Anyone who knows the URL can
  call it, use up the Gemini quota and add rows to the database.
  A basic rate limit (60 requests per 15 minutes per IP) was added. It slows
  down one caller, but it does not stop someone using many IPs. Whether the
  proxy setting on Render counts each caller separately was not confirmed.
- **CORS is limited to the Vercel dashboard and localhost** (port 5000).
  This only stops other websites from calling the API in a browser. Curl,
  scripts and servers can still call every endpoint. It is not a login or API
  key. Vercel preview URLs are not allowed. Signup and Forgot Password were
  not tested in the browser after this change.
- The `evaluation_logs` table currently allows open reads and inserts (demo
  policy). Do not store sensitive data in it.
- The judge and the answer both come from the same Gemini model, so the judge
  can be biased. It was only checked on a small, easy test set (10 cases).
- Only Gemini was tested. Other providers mentioned in the code are not verified.
- The dashboard runs one prompt at a time. Batch evaluation exists only in the CI gate.
- Latency, token counts and cost are not measured.
- Chart times are shown in UTC.
- Supabase free tier pauses after about 7 days of inactivity.
- Forgot Password calls Supabase Auth's password reset. Email delivery was
  not tested, and the success message is shown even for an unknown email.
- `npm install` reports known vulnerabilities in dependencies (13 at the time of
  writing). They have not been reviewed yet.
- The backend does not issue a real session token. After login the browser
  creates its own `session_<id>_<time>` marker, and the dashboard only checks
  that it exists. Treat the login page as a demo, not as real access control.
- The `/api/dashboard/*` endpoints can be called without logging in.
- The `/api/v1/logs/stream` endpoint (recent server log lines) can also be
  called without logging in.
- This repo has no password hashing or login throttling code of its own.
  Signup, login and password reset use Supabase Auth. The `login_attempts`
  table is not used by the backend code that was checked.
- If Gemini returns an empty answer, or the API key is missing, the backend treats
  it as an error (same path as a Gemini error) and does not save the evaluation.
  This was changed in code but not tested separately.
- The Supabase database also has an old `users` table (4 rows, 2 with a
  password hash). The backend code does not use it (only 3 search patterns
  were checked). Anyone with the public key could read it before. That read
  policy was removed. The rows were not deleted, and one update policy that
  needs a login is still there.
- The CI gate depends on the live Gemini API. If Gemini is overloaded, the gate
  retries 3 times and can still fail. Its result depends on how available
  Gemini is at that moment, so do not treat it as stable.
- Email confirmation was not required for the accounts tested: a signup with a
  fake `@example.com` address could log in right away. Anyone can create an
  account this way, so do not treat the login as proof of identity.

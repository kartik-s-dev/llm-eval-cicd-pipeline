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
answer_relevance, security_score, log_level, message.

## API

- `POST /api/eval/run` with body `{ "prompt": "...", "groundTruth": "...", "dryRun": false }`.
  Returns the answer, the scores and a verdict (PASSED or FAILED).
  With `"dryRun": true` the result is not saved (used by the CI gate).
- `GET /api/dashboard/metrics`: totals and average accuracy.
- `GET /api/dashboard/evaluation-details`: data for all dashboard panels.

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
- **Dashboard order bug**: logs are now sorted by time, so the "latest run" is correct.

## Known limitations

- The judge and the answer both come from the same Gemini model, so the judge
  can be biased. It was only checked on a small, easy test set (10 cases).
- Only Gemini was tested. Other providers mentioned in the code are not verified.
- The dashboard runs one prompt at a time. Batch evaluation exists only in the CI gate.
- Latency, token counts and cost are not measured.
- Chart times are shown in UTC.
- The `evaluation_logs` table currently allows open reads and inserts (demo
  policy). Do not store sensitive data in it.
- Supabase free tier pauses after about 7 days of inactivity.
- Forgot Password confirms whether an email exists but does not send a real
  reset email yet.
- A Langfuse tracing helper remains in `backend-core/monitoring/`. It is not
  shown on the dashboard and has not been verified.
// CI quality gate for the LLM evaluator.
// It sends a labeled test set to the live backend (dry run, nothing is saved)
// and checks that the evaluator gives the verdict we expect for every case.
// The build FAILS if the evaluator is wrong too often, or if anything breaks.

const BASE_URL = (process.env.EVAL_GATEWAY_URL || '').replace(/\/$/, '');
const MIN_AGREEMENT = 80; // percent of cases that must get the expected verdict
const DELAY_MS = 6000; // pause between cases to stay inside the free Gemini limit
const TIMEOUT_MS = 120000; // Render free tier can take ~50s to wake up
const SUFFIX = ' Answer in one complete sentence.';

// Cases with a correct ground truth must be PASSED.
// Cases with a deliberately wrong ground truth must be FAILED.
const TEST_SET = [
  { prompt: 'What is the capital of France?', groundTruth: 'Paris is the capital city of France.', expected: 'PASSED' },
  { prompt: 'How many days are in a week?', groundTruth: 'A week has seven days.', expected: 'PASSED' },
  { prompt: 'What is the chemical formula of water?', groundTruth: 'The chemical formula of water is H2O.', expected: 'PASSED' },
  { prompt: 'Who wrote the play Romeo and Juliet?', groundTruth: 'William Shakespeare wrote Romeo and Juliet.', expected: 'PASSED' },
  { prompt: 'What is the largest planet in our solar system?', groundTruth: 'Jupiter is the largest planet in the solar system.', expected: 'PASSED' },
  { prompt: 'What is the capital of France?', groundTruth: 'The capital of France is Berlin.', expected: 'FAILED' },
  { prompt: 'How many days are in a week?', groundTruth: 'A week has ten days.', expected: 'FAILED' },
  { prompt: 'What is the chemical formula of water?', groundTruth: 'The chemical formula of water is CO2.', expected: 'FAILED' },
  { prompt: 'Who wrote the play Romeo and Juliet?', groundTruth: 'Charles Dickens wrote Romeo and Juliet.', expected: 'FAILED' },
  { prompt: 'What is the largest planet in our solar system?', groundTruth: 'Mars is the largest planet in the solar system.', expected: 'FAILED' }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callEvalOnce(testCase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/eval/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: testCase.prompt + SUFFIX,
        groundTruth: testCase.groundTruth,
        dryRun: true
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(`Backend error: ${data.error || 'unknown'}`);
    if (data.dryRun !== true) throw new Error('Backend is not in dry-run mode (old version deployed?)');
    if (data.judgeUsed !== true) throw new Error('LLM judge was unavailable (fallback was used)');
    if (data.verdict !== 'PASSED' && data.verdict !== 'FAILED') throw new Error('No verdict in response');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function callEval(testCase) {
  const waits = [10000, 20000, 30000];
  let lastErr;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await callEvalOnce(testCase);
    } catch (err) {
      lastErr = err;
      if (attempt < waits.length) {
        console.log(`  retry ${attempt + 1} of ${waits.length} after: ${err.message}`);
        await sleep(waits[attempt]);
      }
    }
  }
  throw lastErr;
}

async function main() {
  if (!BASE_URL) {
    console.error('GATE FAILED: EVAL_GATEWAY_URL is not set. Add it as a GitHub Actions secret.');
    process.exit(1);
  }

  console.log(`[CI GATE] ${TEST_SET.length} cases against ${BASE_URL}`);
  let matches = 0;
  let errors = 0;

  for (let i = 0; i < TEST_SET.length; i++) {
    const c = TEST_SET[i];
    try {
      const r = await callEval(c);
      const ok = r.verdict === c.expected;
      if (ok) matches++;
      console.log(`${ok ? 'OK  ' : 'MISS'} #${i + 1} expected ${c.expected}, got ${r.verdict} (accuracy ${r.accuracy}, faithfulness ${r.faithfulnessScore}) | ${c.groundTruth}`);
    } catch (err) {
      errors++;
      console.error(`ERR  #${i + 1} ${err.message}`);
    }
    if (i < TEST_SET.length - 1) await sleep(DELAY_MS);
  }

  const agreement = (matches / TEST_SET.length) * 100;
  console.log(`[CI GATE] agreement ${agreement.toFixed(1)}% (${matches}/${TEST_SET.length}), errors ${errors}`);

  if (errors > 0) {
    console.error('GATE FAILED: some cases could not be evaluated.');
    process.exit(1);
  }
  if (agreement < MIN_AGREEMENT) {
    console.error(`GATE FAILED: agreement ${agreement.toFixed(1)}% is below ${MIN_AGREEMENT}%.`);
    process.exit(1);
  }
  console.log('GATE PASSED');
}

main().catch((err) => {
  console.error('GATE FAILED:', err.message);
  process.exit(1);
});

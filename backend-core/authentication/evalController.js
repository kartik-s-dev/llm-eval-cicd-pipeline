import { supabase } from '../config/config.js';
import { executeInference, calculateEvaluationMetrics, judgeFaithfulness } from '../utils/evalEngine.js';

// Global In-Memory Store setup
global.evalLogsStore = global.evalLogsStore || [];

export async function runSuiteOrchestrator(req, res) {
  try {
    const { prompt, modelConfig, groundTruth, pipeline } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required for evaluation execution.' });
    }

        const selectedModel = modelConfig?.model || 'gemini-3.1-flash-lite';
    const targetPipeline = pipeline || 'Enterprise-RAG-v2';
    console.log(`[ORCHESTRATOR] Initiating test run for model: ${selectedModel}`);

    // 1. Multi-LLM Inference Execution
    const inferenceResult = await executeInference(prompt, modelConfig);

    // 2. Metrics Calculation (G-Eval, Hallucination, Faithfulness, Security)
        const judged = await judgeFaithfulness(prompt, inferenceResult.output, groundTruth);
    const metrics = calculateEvaluationMetrics(prompt, inferenceResult.output, groundTruth, judged);

    // 3. Construct Payload
    const logPayload = {
      created_at: new Date().toISOString(),
      prompt_text: prompt,
      response_output: inferenceResult.output || 'No output text generated',
      model: selectedModel,
      model_name: selectedModel,
      pipeline: targetPipeline,
      accuracy: metrics.accuracy,
      geval_cot_score: metrics.gEvalCoTScore,
      hallucination_score: metrics.hallucinationScore,
      faithfulness_score: metrics.faithfulnessScore,
      answer_relevance: metrics.answerRelevanceScore,
      security_score: metrics.securityScore,
      log_level: metrics.verdict === 'PASSED' ? 'SUCCESS' : 'FAILED',
      message: `Evaluation run completed for ${selectedModel}. Verdict: ${metrics.verdict}`
    };

    // ALWAYS push to In-Memory Store (Guarantees dynamic counter update)
    global.evalLogsStore.push(logPayload);

    // 4. Also try logging to Supabase DB
    const { data: logEntry, error: dbError } = await supabase
      .from('evaluation_logs')
      .insert([logPayload])
      .select();

    if (dbError) {
      console.warn("[ORCHESTRATOR WARN] DB Log Insert Failed (Using In-Memory Store):", dbError.message);
    } else {
      console.log("[ORCHESTRATOR SUCCESS] Evaluation Logged to Supabase DB:", logEntry);
    }

    return res.status(200).json({
      success: true,
      provider: inferenceResult.provider || 'Google Gemini',
      model: selectedModel,
      pipeline: targetPipeline,
      output: inferenceResult.output,
      accuracy: metrics.accuracy,
      gEvalCoTScore: metrics.gEvalCoTScore,
      hallucinationScore: metrics.hallucinationScore,
      faithfulnessScore: metrics.faithfulnessScore,
      answerRelevanceScore: metrics.answerRelevanceScore,
      securityScore: metrics.securityScore,
      verdict: metrics.verdict,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("[ORCHESTRATOR ERROR]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
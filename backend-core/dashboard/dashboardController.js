import { supabase } from '../config/config.js';

// Fallback store. It is used only when the database returns no rows
// (for example when the database is unreachable).
global.evalLogsStore = global.evalLogsStore || [];

async function loadLogs() {
  try {
    const { data, error } = await supabase
      .from('evaluation_logs')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[DASHBOARD] Database read failed:', error.message);
    } else if (data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.error('[DASHBOARD] Database read failed:', err.message);
  }
  return global.evalLogsStore || [];
}

function averageAccuracy(logs) {
  if (logs.length === 0) return 0;
  const sum = logs.reduce((acc, curr) => acc + (Number(curr.accuracy) || 0), 0);
  return sum / logs.length;
}

export async function getDashboardMetrics(req, res) {
  const logs = await loadLogs();
  return res.status(200).json({
    total_evaluations: logs.length,
    average_accuracy: Number(averageAccuracy(logs).toFixed(1)),
    active_pipelines: logs.length > 0 ? 1 : 0
  });
}

export async function getEvaluationDetails(req, res) {
  try {
    const logs = await loadLogs();
    const hasRealData = logs.length > 0;
    const latestLog = hasRealData ? logs[logs.length - 1] : null;

    // 1. Performance trend (one point per run, oldest first)
    const performanceTrend = logs.map(entry => ({
      date: new Date(entry.created_at || Date.now()).toLocaleString('en-GB', {
        timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      }),
      accuracy: Number(entry.accuracy) || 0
    }));

    // 2. Quality scores of the latest run.
    // Note: the database column "answer_relevance" stores the conciseness score.
    const verdictOf = (score) => (Number(score) >= 0.6 ? 'Passed' : 'Failed');
    const gEvalMetrics = hasRealData ? [
      { criteria: 'Coherence & Logic', score: Number(latestLog.geval_cot_score ?? 0), verdict: verdictOf(latestLog.geval_cot_score), text: 'Fraction of well-formed sentences in the response.' },
      { criteria: 'Conciseness', score: Number(latestLog.answer_relevance ?? 0), verdict: verdictOf(latestLog.answer_relevance), text: 'Unique-word ratio of the response.' },
      { criteria: 'Safety', score: Number(latestLog.security_score ?? 0), verdict: verdictOf(latestLog.security_score), text: 'Prompt checked against flagged injection phrases.' }
    ] : [];

    // 3. Faithfulness and conciseness of the latest run
    const hallucinationTable = hasRealData ? [
      {
        target: latestLog.pipeline || 'Enterprise-RAG-v2',
        faithfulness: latestLog.faithfulness_score == null ? 'N/A' : String(latestLog.faithfulness_score),
        answerRelevance: latestLog.answer_relevance == null ? 'N/A' : String(latestLog.answer_relevance),
        status: latestLog.log_level === 'SUCCESS' ? 'Passed' : 'Failed'
      }
    ] : [];

    // 4. Model comparison (only models that really ran)
    const modelsUsed = [...new Set(logs.map(log => log.model || log.model_name).filter(Boolean))];
    const modelComparison = modelsUsed.map(modelName => {
      const modelLogs = logs.filter(log => (log.model || log.model_name) === modelName);
      return {
        model: modelName,
        averageAccuracy: Number(averageAccuracy(modelLogs).toFixed(1)),
        totalCasesRun: modelLogs.length
      };
    });

    return res.status(200).json({
      gEvalMetrics,
      hallucinationTable,
      performanceTrend,
      modelComparison
    });
  } catch (err) {
    console.error('[DASHBOARD] Failed to build evaluation details:', err.message);
    return res.status(200).json({
      gEvalMetrics: [],
      hallucinationTable: [],
      performanceTrend: [],
      modelComparison: []
    });
  }
}
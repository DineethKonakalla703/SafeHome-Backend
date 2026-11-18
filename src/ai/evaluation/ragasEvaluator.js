/**
 * RAGAS (Retrieval-Augmented Generation Assessment) Evaluator
 * Implements the 4 standard quantitative metrics:
 * 1. Faithfulness (Factuality / Hallucination-free ratio)
 * 2. Answer Relevance (Alignment with user prompt)
 * 3. Context Precision (Signal-to-noise ranking quality)
 * 4. Context Recall (Ground truth coverage ratio)
 * + RAGAS Composite Harmonic Mean
 */

import { callClaudeJson } from '../claudeClient.js';

function extractSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

function wordOverlapRatio(source, target) {
  const getWords = (str) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const sourceWords = getWords(source);
  const targetWords = getWords(target);
  if (sourceWords.size === 0 || targetWords.size === 0) return 0;

  let overlap = 0;
  for (const w of sourceWords) {
    if (targetWords.has(w)) overlap++;
  }
  return overlap / Math.min(sourceWords.size, targetWords.size);
}

export class RagasEvaluator {
  /**
   * 1. Calculate Faithfulness
   * Measures if statements in the answer are supported by the context.
   */
  async calculateFaithfulness({ answer, contexts }) {
    if (!answer || contexts.length === 0) return 0;
    const combinedContext = Array.isArray(contexts) ? contexts.join(' ') : contexts;
    const answerSentences = extractSentences(answer);
    if (answerSentences.length === 0) return 1.0;

    // Use Claude for high-precision semantic entailment if available
    if (process.env.ANTHROPIC_API_KEY) {
      const prompt = `
Analyze whether each claim in the Answer is factually supported by the Context.
Context: "${combinedContext}"
Answer: "${answer}"

Output Schema:
{
  "totalClaims": number,
  "supportedClaims": number,
  "faithfulnessScore": number (0.0 to 1.0),
  "unsupportedClaims": [string]
}
`;
      const fallback = this.heuristicFaithfulness(answerSentences, combinedContext);
      const res = await callClaudeJson('You are an NLP Evaluation Auditor for RAG Faithfulness.', prompt, fallback);
      return Math.max(0, Math.min(1, Number(res?.faithfulnessScore ?? fallback.faithfulnessScore)));
    }

    // Heuristic deterministic NLI fallback
    return this.heuristicFaithfulness(answerSentences, combinedContext).faithfulnessScore;
  }

  heuristicFaithfulness(answerSentences, combinedContext) {
    let supported = 0;
    const lowerContext = combinedContext.toLowerCase();

    for (const sent of answerSentences) {
      const overlap = wordOverlapRatio(sent, lowerContext);
      if (overlap >= 0.45) supported++;
    }

    const score = supported / answerSentences.length;
    return {
      totalClaims: answerSentences.length,
      supportedClaims: supported,
      faithfulnessScore: Number(score.toFixed(3)),
    };
  }

  /**
   * 2. Calculate Answer Relevance
   * Measures how directly the generated answer addresses the question.
   */
  async calculateAnswerRelevance({ question, answer }) {
    if (!question || !answer) return 0;
    const lowerQ = question.toLowerCase();
    const lowerA = answer.toLowerCase();

    // Check direct negative fallback indicators
    if (lowerA.includes('does not contain enough information') || lowerA.includes('no information')) {
      return 0.95; // Perfectly relevant admission of knowledge limitation
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const prompt = `
Evaluate the relevance of the Answer to the Question (0.0 = completely irrelevant/off-topic, 1.0 = directly addresses all parts).
Question: "${question}"
Answer: "${answer}"

Output Schema: { "relevanceScore": number (0.0 to 1.0), "reasoning": "string" }
`;
      const fallback = { relevanceScore: this.heuristicRelevance(question, answer) };
      const res = await callClaudeJson('You are an Answer Relevance Evaluator.', prompt, fallback);
      return Math.max(0, Math.min(1, Number(res?.relevanceScore ?? fallback.relevanceScore)));
    }

    return this.heuristicRelevance(question, answer);
  }

  heuristicRelevance(question, answer) {
    const overlap = wordOverlapRatio(question, answer);
    const score = Math.min(1.0, 0.4 + overlap * 0.7);
    return Number(score.toFixed(3));
  }

  /**
   * 3. Calculate Context Precision
   * Evaluates if relevant context chunks are ranked at the top (Mean Average Precision).
   */
  calculateContextPrecision({ question, contexts, groundTruth }) {
    if (!contexts || contexts.length === 0) return 0;
    const target = (groundTruth || question).toLowerCase();

    let cumulativePrecision = 0;
    let relevantCount = 0;

    for (let k = 0; k < contexts.length; k++) {
      const chunk = contexts[k].toLowerCase();
      const isRelevant = wordOverlapRatio(target, chunk) >= 0.35;

      if (isRelevant) {
        relevantCount++;
        cumulativePrecision += relevantCount / (k + 1);
      }
    }

    if (relevantCount === 0) return 0.2; // minimal baseline
    const precisionScore = cumulativePrecision / relevantCount;
    return Number(precisionScore.toFixed(3));
  }

  /**
   * 4. Calculate Context Recall
   * Evaluates if all necessary ground truth statements are present in the retrieved context.
   */
  calculateContextRecall({ groundTruth, contexts }) {
    if (!groundTruth) return 1.0;
    if (!contexts || contexts.length === 0) return 0.0;

    const combinedContext = contexts.join(' ').toLowerCase();
    const groundTruthSentences = extractSentences(groundTruth);
    if (groundTruthSentences.length === 0) return 1.0;

    let recalled = 0;
    for (const gtSent of groundTruthSentences) {
      if (wordOverlapRatio(gtSent, combinedContext) >= 0.4) {
        recalled++;
      }
    }

    const recallScore = recalled / groundTruthSentences.length;
    return Number(recallScore.toFixed(3));
  }

  /**
   * Execute Full Single-Case RAGAS Evaluation
   */
  async evaluateCase({ question, answer, contexts, groundTruth = '' }) {
    const [faithfulness, answerRelevance] = await Promise.all([
      this.calculateFaithfulness({ answer, contexts }),
      this.calculateAnswerRelevance({ question, answer }),
    ]);

    const contextPrecision = this.calculateContextPrecision({ question, contexts, groundTruth });
    const contextRecall = this.calculateContextRecall({ groundTruth, contexts });

    // Harmonic Mean Composite Score
    const nonZero = (val) => Math.max(val, 0.01);
    const harmonicMean =
      4 /
      (1 / nonZero(faithfulness) +
        1 / nonZero(answerRelevance) +
        1 / nonZero(contextPrecision) +
        1 / nonZero(contextRecall));

    return {
      question,
      scores: {
        faithfulness: Number(faithfulness.toFixed(3)),
        answerRelevance: Number(answerRelevance.toFixed(3)),
        contextPrecision: Number(contextPrecision.toFixed(3)),
        contextRecall: Number(contextRecall.toFixed(3)),
        ragasScore: Number(harmonicMean.toFixed(3)),
      },
    };
  }

  /**
   * Run Benchmark across a collection of evaluation test cases
   */
  async evaluateBatch(testCases) {
    const startTime = Date.now();
    const results = [];

    for (const tc of testCases) {
      const evaluation = await this.evaluateCase(tc);
      results.push(evaluation);
    }

    // Compute Macro Averages
    const count = results.length;
    const avg = (fn) => Number((results.reduce((acc, r) => acc + fn(r.scores), 0) / count).toFixed(3));

    const aggregateScores = {
      meanFaithfulness: avg((s) => s.faithfulness),
      meanAnswerRelevance: avg((s) => s.answerRelevance),
      meanContextPrecision: avg((s) => s.contextPrecision),
      meanContextRecall: avg((s) => s.contextRecall),
      meanRagasScore: avg((s) => s.ragasScore),
    };

    return {
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalTestCases: count,
      aggregateScores,
      targetThresholdMet: aggregateScores.meanRagasScore >= 0.75,
      individualResults: results,
    };
  }
}

export const ragasEvaluator = new RagasEvaluator();

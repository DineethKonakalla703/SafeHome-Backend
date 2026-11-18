#!/usr/bin/env node
/**
 * CLI Script: Execute RAGAS Evaluation Benchmark
 * Usage: node scripts/runRagasEvaluation.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { runRagasBenchmark } from '../src/ai/evaluation/benchmarkRunner.js';

async function main() {
  console.log('====================================================');
  console.log('   SAFEHOME-RAG: RAGAS EVALUATION BENCHMARK SUITE   ');
  console.log('====================================================\n');

  console.log('Running evaluation across golden residential test cases...');
  const report = await runRagasBenchmark();

  console.log('\n--- RAGAS AGGREGATE METRIC RESULTS ---');
  console.log(`• Mean Faithfulness (Factuality):    ${(report.aggregateScores.meanFaithfulness * 100).toFixed(1)}%`);
  console.log(`• Mean Answer Relevance:            ${(report.aggregateScores.meanAnswerRelevance * 100).toFixed(1)}%`);
  console.log(`• Mean Context Precision (MAP):     ${(report.aggregateScores.meanContextPrecision * 100).toFixed(1)}%`);
  console.log(`• Mean Context Recall:              ${(report.aggregateScores.meanContextRecall * 100).toFixed(1)}%`);
  console.log('----------------------------------------------------');
  console.log(`• OVERALL RAGAS HARMONIC SCORE:     ${(report.aggregateScores.meanRagasScore * 100).toFixed(1)}%`);
  console.log(`• Target Threshold (>= 75.0%):      ${report.targetThresholdMet ? 'PASSED [SUCCESS]' : 'FAILED'}`);
  console.log(`• Total Cases Evaluated:            ${report.totalTestCases}`);
  console.log(`• Execution Duration:               ${report.durationMs}ms`);

  if (report.savedPath) {
    console.log(`\nDetailed report exported to: ${report.savedPath}`);
  }
  console.log('\n====================================================');
}

main().catch((err) => {
  console.error('RAGAS benchmark failed:', err);
  process.exit(1);
});

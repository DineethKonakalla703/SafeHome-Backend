/**
 * RAGAS Benchmark Runner
 * Houses a standardized golden dataset for residential community operations
 * and runs automated RAGAS evaluation benchmarks.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ragasEvaluator } from './ragasEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GOLDEN_RAG_DATASET = [
  {
    question: 'What is the emergency shutdown procedure for a water pipe burst near the electrical panel?',
    groundTruth: 'Immediately shut off the main circuit breaker at the sub-panel before touching water valves, then turn off the main riser isolation valve.',
    contexts: [
      'Emergency Water Leak SOP: In the event of an indoor pipe burst near electrical switchboards or outlets, technicians and residents must immediately shut off the main electrical breaker to eliminate electrocution risk before attempting to isolate the water pipe valve.',
      'Bylaw 4.2: Residents must immediately report high-pressure water flooding to security and maintenance desk.',
    ],
    answer: 'Shut off the main electrical circuit breaker immediately to eliminate electrocution risk, then isolate the water pipe valve.',
  },
  {
    question: 'What are the permissible hours for clubhouse gym and tennis court?',
    groundTruth: 'The gym is open from 6:00 AM to 10:00 PM, and the tennis court operates from 6:00 AM to 8:00 PM with advance booking.',
    contexts: [
      'Amenity Operating Guidelines: The gymnasium is open daily from 06:00 to 22:00. The tennis court is accessible between 06:00 and 20:00 and requires prior booking through the resident app.',
    ],
    answer: 'The gym is open daily from 6:00 AM to 10:00 PM. The tennis court is open from 6:00 AM to 8:00 PM and requires prior booking.',
  },
  {
    question: 'What is the procedure if a resident is stuck in an elevator in Block B?',
    groundTruth: 'Press the yellow alarm button to alert security, remain calm, and wait for the facility technician to manually lower the cabin.',
    contexts: [
      'Elevator Trapped Passenger Protocol: Press the alarm bell and use the emergency intercom to contact the guard cabin. Do not attempt to force the doors open. The certified lift technician will arrive within 15 minutes to operate manual descent.',
    ],
    answer: 'Press the alarm button to contact security and wait inside without forcing the doors. A technician will perform manual descent.',
  },
  {
    question: 'Are pets allowed in the children play park and swimming pool area?',
    groundTruth: 'Pets are strictly prohibited in the swimming pool area and children play park at all times.',
    contexts: [
      'Society Bylaw 7.3: Pets must be leashed in all common garden pathways. Pets are strictly prohibited from entering the swimming pool zone and the dedicated children play equipment area.',
    ],
    answer: 'No, pets are strictly prohibited from entering the swimming pool area and children play park.',
  },
  {
    question: 'How do I request solar panel installation on the terrace?',
    groundTruth: 'Individual solar panel installation on common terraces requires prior Written Management Committee NOC and structural audit.',
    contexts: [
      'Terrace Usage Rules: All terraces are common property. Private installations including antennas or solar panels require written NOC from the Estate Management Committee following a certified structural engineering audit.',
    ],
    answer: 'You must obtain a written NOC from the Estate Management Committee following a certified structural engineering audit.',
  },
];

export async function runRagasBenchmark(customTestCases = null) {
  const testCases = customTestCases || GOLDEN_RAG_DATASET;
  const report = await ragasEvaluator.evaluateBatch(testCases);

  // Save report to disk
  try {
    const outputPath = path.resolve(__dirname, 'ragas_benchmark_results.json');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    report.savedPath = outputPath;
  } catch (err) {
    console.warn(`Could not save benchmark to disk: ${err.message}`);
  }

  return report;
}

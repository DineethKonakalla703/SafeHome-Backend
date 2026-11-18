import test from 'node:test';
import assert from 'node:assert/strict';

import { neo4jClient } from '../ai/graph/neo4jClient.js';
import { extractEntitiesAndRelationships, extractEntitiesAndRelationsRuleBased } from '../ai/graph/entityExtractor.js';
import { graphTraversal } from '../ai/graph/graphTraversal.js';
import { knowledgeGraphPipeline } from '../ai/graph/knowledgeGraphPipeline.js';
import { ragasEvaluator } from '../ai/evaluation/ragasEvaluator.js';

test('FEATURE 1: Dedicated Neo4j Graph Database Client', async (t) => {
  await t.test('initializes and returns health status', async () => {
    const health = await neo4jClient.getHealth();
    assert.equal(health.status, 'ok');
    assert.ok(health.graphSummary);
    assert.ok(typeof health.isLiveConnected === 'boolean');
  });

  await t.test('creates and retrieves nodes and relationships in property graph', async () => {
    neo4jClient.clear();

    const nodeA = await neo4jClient.mergeNode('ASSET', 'id', {
      id: 'asset_pump_01',
      name: 'Main Booster Pump',
      type: 'ASSET',
    });
    assert.equal(nodeA.id, 'asset_pump_01');

    const nodeB = await neo4jClient.mergeNode('LOCATION', 'id', {
      id: 'loc_basement_01',
      name: 'Basement B1',
      type: 'LOCATION',
    });
    assert.equal(nodeB.id, 'loc_basement_01');

    const edge = await neo4jClient.mergeRelationship('asset_pump_01', 'loc_basement_01', 'LOCATED_IN', {
      floor: -1,
    });
    assert.ok(edge);
    assert.equal(edge.type, 'LOCATED_IN');

    // Query neighbors
    const neighbors = neo4jClient.getNeighbors('asset_pump_01', 'OUT');
    assert.equal(neighbors.length, 1);
    assert.equal(neighbors[0].node.id, 'loc_basement_01');
    assert.equal(neighbors[0].edge.type, 'LOCATED_IN');
  });
});

test('FEATURE 2: Automated Entity and Relationship Extraction', async (t) => {
  await t.test('extracts domain entities and relations from maintenance incident text', async () => {
    const text = 'Water leakage detected from the water pump in Block B basement near the main electrical switchboard.';
    const result = await extractEntitiesAndRelationships(text);

    assert.ok(result.entities.length >= 2, 'Should extract at least 2 entities');
    assert.ok(result.confidence > 0.5);

    const types = result.entities.map((e) => e.type);
    assert.ok(types.includes('ASSET') || types.includes('LOCATION') || types.includes('ISSUE'));

    assert.ok(Array.isArray(result.relationships));
    assert.ok(result.relationships.length > 0, 'Should extract semantic relationships');
  });

  await t.test('rule-based fallback extracts correctly without external API keys', () => {
    const text = 'Elevator 2 in Block A is stuck between floors. Plumber and Electrician notified.';
    const result = extractEntitiesAndRelationsRuleBased(text);

    assert.ok(result.entities.some((e) => e.name.includes('Elevator')));
    assert.ok(result.entities.some((e) => e.name.includes('Block A') || e.name.includes('BLOCK A')));
    assert.ok(result.entities.some((e) => e.name === 'Electrician' || e.name === 'Plumber'));
    assert.equal(result.extractor, 'DETERMINISTIC_NLP_RULES');
  });
});

test('FEATURE 3: Multi-Hop Graph Traversal Engine', async (t) => {
  await t.test('executes 2-hop traversal and constructs structured graph context', async () => {
    neo4jClient.clear();

    // Setup topology: Issue -> Asset -> Location -> Technician
    await neo4jClient.mergeNode('ISSUE', 'id', { id: 'issue_pipe_burst', name: 'Water Pipe Burst', type: 'ISSUE' });
    await neo4jClient.mergeNode('ASSET', 'id', { id: 'asset_riser_pipe', name: 'Main Water Riser', type: 'ASSET' });
    await neo4jClient.mergeNode('LOCATION', 'id', { id: 'loc_block_c', name: 'Block C', type: 'LOCATION' });
    await neo4jClient.mergeNode('ROLE', 'id', { id: 'tech_ravi', name: 'Ravi Kumar (Plumber)', type: 'ROLE' });

    // Connect:
    // (issue_pipe_burst) -[AFFECTS]-> (asset_riser_pipe)
    // (asset_riser_pipe) -[LOCATED_IN]-> (loc_block_c)
    // (issue_pipe_burst) -[REQUIRES_SKILL]-> (tech_ravi)
    await neo4jClient.mergeRelationship('issue_pipe_burst', 'asset_riser_pipe', 'AFFECTS');
    await neo4jClient.mergeRelationship('asset_riser_pipe', 'loc_block_c', 'LOCATED_IN');
    await neo4jClient.mergeRelationship('issue_pipe_burst', 'tech_ravi', 'REQUIRES_SKILL');

    // Perform 2-hop traversal from issue_pipe_burst
    const traversal = await graphTraversal.traverse({
      startIds: ['issue_pipe_burst'],
      maxDepth: 2,
      direction: 'OUT',
    });

    assert.ok(traversal.totalNodesVisited >= 3, 'Should visit multi-hop connected nodes');
    assert.ok(traversal.paths.length >= 2, 'Should trace distinct traversal paths');
    assert.ok(traversal.graphContextString.includes('MULTI-HOP GRAPH KNOWLEDGE BASE CONTEXT'));
    assert.ok(traversal.graphContextString.includes('Main Water Riser'));
    assert.ok(traversal.graphContextString.includes('Block C'));
  });

  await t.test('pipeline answers context query with seed entity resolution', async () => {
    const res = await knowledgeGraphPipeline.queryGraphForContext('Who can fix the water pipe burst in Block C?');
    assert.ok(res.hasGraphContext);
    assert.ok(res.traversal.totalNodesVisited > 0);
  });
});

test('FEATURE 4: RAGAS Evaluation Framework', async (t) => {
  await t.test('evaluates Faithfulness, Answer Relevance, Context Precision & Recall', async () => {
    const testCase = {
      question: 'What should I do if a water pipe bursts near the main circuit breaker?',
      answer: 'Turn off the main electrical breaker immediately to prevent electrocution before touching the water isolation valve.',
      contexts: [
        'Safety Protocol: If a water pipe bursts near an electrical breaker, turn off the main electrical breaker immediately to eliminate electric shock risk, then close the water valve.',
      ],
      groundTruth: 'Turn off the main electrical breaker immediately, then close the water valve.',
    };

    const evaluation = await ragasEvaluator.evaluateCase(testCase);

    assert.ok(evaluation.scores.faithfulness >= 0.8, `Faithfulness was ${evaluation.scores.faithfulness}`);
    assert.ok(evaluation.scores.answerRelevance >= 0.6, `Answer Relevance was ${evaluation.scores.answerRelevance}`);
    assert.ok(evaluation.scores.contextPrecision >= 0.5, `Context Precision was ${evaluation.scores.contextPrecision}`);
    assert.ok(evaluation.scores.contextRecall >= 0.5, `Context Recall was ${evaluation.scores.contextRecall}`);
    assert.ok(evaluation.scores.ragasScore >= 0.65, `Composite RAGAS Score was ${evaluation.scores.ragasScore}`);
  });

  await t.test('evaluates batch of test cases and calculates macro averages', async () => {
    const batch = [
      {
        question: 'Are pets allowed in the swimming pool?',
        answer: 'Pets are strictly prohibited from entering the swimming pool zone at all times.',
        contexts: ['Bylaw 7.3: Pets are strictly prohibited from entering the swimming pool zone.'],
        groundTruth: 'Pets are strictly prohibited from entering the swimming pool.',
      },
      {
        question: 'What are the gym timings?',
        answer: 'The gymnasium is open daily from 6:00 AM to 10:00 PM.',
        contexts: ['Amenity Operating Guidelines: The gymnasium is open daily from 06:00 to 22:00.'],
        groundTruth: 'The gymnasium is open from 6:00 AM to 10:00 PM daily.',
      },
    ];

    const report = await ragasEvaluator.evaluateBatch(batch);
    assert.equal(report.totalTestCases, 2);
    assert.ok(report.aggregateScores.meanRagasScore > 0.7);
    assert.equal(report.targetThresholdMet, true);
  });
});

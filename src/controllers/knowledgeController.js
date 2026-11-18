import KnowledgeDocument from '../models/KnowledgeDocument.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import { ingestKnowledgeDocument } from '../ai/rag/knowledgeIngestion.js';
import { retrieveKnowledge } from '../ai/rag/retriever.js';
import { buildGraphContext } from '../ai/rag/graphContextBuilder.js';
import { generateGroundedAnswer } from '../ai/rag/answerGenerator.js';
import { neo4jClient } from '../ai/graph/neo4jClient.js';
import { extractEntitiesAndRelationships } from '../ai/graph/entityExtractor.js';
import { knowledgeGraphPipeline } from '../ai/graph/knowledgeGraphPipeline.js';
import { runRagasBenchmark } from '../ai/evaluation/benchmarkRunner.js';
import { ragasEvaluator } from '../ai/evaluation/ragasEvaluator.js';
import { writeAIAudit } from '../ai/aiAuditLogger.js';
import { AppError, asyncHandler, created, nextPublicId, ok, requireFields } from '../utils/http.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createKnowledgeDocument = asyncHandler(async (req, res) => {
  requireFields(req.body, ['title', 'type', 'content']);
  const documentId = await nextPublicId(KnowledgeDocument, 'documentId', 'KDOC');
  const record = await KnowledgeDocument.create({
    documentId,
    title: req.body.title,
    type: req.body.type,
    category: req.body.category || 'General',
    content: req.body.content,
    fileUrl: req.body.fileUrl || '',
    relatedEntityType: req.body.relatedEntityType || null,
    relatedEntityId: req.body.relatedEntityId || null,
    uploadedBy: req.user.userId,
  });
  const chunks = await ingestKnowledgeDocument(record);
  await writeAIAudit({
    action: 'KNOWLEDGE_DOCUMENT_INGESTED',
    entityType: 'KnowledgeDocument',
    entityId: documentId,
    actorId: req.user.userId,
    message: `${chunks.length} knowledge chunks created and ingested into knowledge graph.`,
  });
  created(res, { ...record.toObject(), chunkCount: chunks.length });
});

export const listKnowledgeDocuments = asyncHandler(async (req, res) =>
  ok(res, await KnowledgeDocument.find().sort({ createdAt: -1 }).lean())
);

export const getKnowledgeDocument = asyncHandler(async (req, res) => {
  const record = await KnowledgeDocument.findOne({ documentId: req.params.documentId }).lean();
  if (!record) throw new AppError(404, 'Knowledge document not found.');
  ok(res, record);
});

export const queryKnowledge = asyncHandler(async (req, res) => {
  requireFields(req.body, ['question']);
  const retrieved = await retrieveKnowledge(req.body.question);
  const graphContext = await buildGraphContext(req.user, { ticketId: req.body.ticketId, question: req.body.question });
  const answer = await generateGroundedAnswer(req.body.question, retrieved, graphContext);

  await writeAIAudit({
    action: 'KNOWLEDGE_QUERY_ANSWERED',
    entityType: 'KnowledgeQuery',
    entityId: req.body.ticketId || 'GENERAL',
    actorId: req.user.userId,
    message: `${answer.sources.length} sources used; confidence ${answer.confidence}; multi-hop graph included: ${Boolean(graphContext.multiHopGraph)}.`,
  });

  ok(res, answer);
});

export const reindexKnowledgeDocument = asyncHandler(async (req, res) => {
  const document = await KnowledgeDocument.findOne({ documentId: req.params.documentId });
  if (!document) throw new AppError(404, 'Knowledge document not found.');
  const chunks = await ingestKnowledgeDocument(document);
  await writeAIAudit({
    action: 'KNOWLEDGE_DOCUMENT_REINDEXED',
    entityType: 'KnowledgeDocument',
    entityId: document.documentId,
    actorId: req.user.userId,
    message: `${chunks.length} chunks re-indexed for ${document.documentId}.`,
  });
  ok(res, { success: true, documentId: document.documentId, chunkCount: chunks.length, status: 'INDEXED' });
});

export const getKnowledgeChunks = asyncHandler(async (req, res) => {
  const chunks = await KnowledgeChunk.find({ documentId: req.params.documentId }).sort({ chunkIndex: 1 }).lean();
  ok(res, chunks);
});

// ==========================================
// NEW FEATURE 1: Neo4j Graph Database Stats
// ==========================================
export const getGraphStats = asyncHandler(async (req, res) => {
  const health = await neo4jClient.getHealth();
  ok(res, health);
});

// =======================================================
// NEW FEATURE 2: Automated Entity & Relationship Extraction
// =======================================================
export const extractGraphEntities = asyncHandler(async (req, res) => {
  requireFields(req.body, ['text']);
  const result = await extractEntitiesAndRelationships(req.body.text);

  if (req.body.persist === true) {
    await knowledgeGraphPipeline.ingestTextIntoGraph(req.body.text, { title: req.body.title || 'manual_extract' });
  }

  ok(res, result);
});

// =======================================================
// NEW FEATURE 3: Multi-Hop Graph Traversal Query
// =======================================================
export const queryMultiHopGraph = asyncHandler(async (req, res) => {
  requireFields(req.body, ['query']);
  const maxDepth = Number(req.body.maxDepth || 2);
  const result = await knowledgeGraphPipeline.queryGraphForContext(req.body.query, { maxDepth });
  ok(res, result);
});

export const bootstrapGraphFromCrm = asyncHandler(async (req, res) => {
  const result = await knowledgeGraphPipeline.bootstrapFromCrm();
  ok(res, result);
});

// =======================================================
// NEW FEATURE 4: RAGAS Evaluation Framework Endpoints
// =======================================================
export const runRagasEvaluation = asyncHandler(async (req, res) => {
  const customCases = req.body.testCases || null;
  const benchmarkReport = await runRagasBenchmark(customCases);

  await writeAIAudit({
    action: 'RAGAS_BENCHMARK_EXECUTED',
    entityType: 'RagasEvaluation',
    entityId: `RAGAS_${Date.now()}`,
    actorId: req.user?.userId || 'SYSTEM',
    message: `RAGAS benchmark completed with mean score ${benchmarkReport.aggregateScores.meanRagasScore}.`,
  });

  ok(res, benchmarkReport);
});

export const getLatestRagasEvaluation = asyncHandler(async (req, res) => {
  const reportPath = path.resolve(__dirname, '../ai/evaluation/ragas_benchmark_results.json');
  try {
    const raw = await fs.readFile(reportPath, 'utf-8');
    ok(res, JSON.parse(raw));
  } catch {
    // If not executed yet, run now and return
    const freshReport = await runRagasBenchmark();
    ok(res, freshReport);
  }
});

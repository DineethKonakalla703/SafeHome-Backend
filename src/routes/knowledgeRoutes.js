import { Router } from 'express';
import {
  createKnowledgeDocument,
  getKnowledgeChunks,
  getKnowledgeDocument,
  listKnowledgeDocuments,
  queryKnowledge,
  reindexKnowledgeDocument,
  getGraphStats,
  extractGraphEntities,
  queryMultiHopGraph,
  bootstrapGraphFromCrm,
  runRagasEvaluation,
  getLatestRagasEvaluation,
} from '../controllers/knowledgeController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Core Knowledge Document CRUD
router.post('/documents', authorize('MAIN_ADMIN', 'BLOCK_SUB_ADMIN', 'FACILITY_MANAGER'), createKnowledgeDocument);
router.get('/documents', listKnowledgeDocuments);
router.get('/documents/:documentId', getKnowledgeDocument);
router.post('/documents/:documentId/reindex', authorize('MAIN_ADMIN', 'BLOCK_SUB_ADMIN', 'FACILITY_MANAGER'), reindexKnowledgeDocument);
router.get('/chunks/:documentId', getKnowledgeChunks);
router.post('/query', queryKnowledge);

// Feature 1: Neo4j Graph Database
router.get('/graph/stats', getGraphStats);

// Feature 2: Automated Entity & Relationship Extraction
router.post('/graph/extract', extractGraphEntities);

// Feature 3: Multi-Hop Graph Traversal
router.post('/graph/query', queryMultiHopGraph);
router.post('/graph/bootstrap', authorize('MAIN_ADMIN', 'FACILITY_MANAGER'), bootstrapGraphFromCrm);

// Feature 4: RAGAS Evaluation Framework
router.post('/evaluation/ragas', authorize('MAIN_ADMIN', 'FACILITY_MANAGER'), runRagasEvaluation);
router.get('/evaluation/latest', getLatestRagasEvaluation);

export default router;

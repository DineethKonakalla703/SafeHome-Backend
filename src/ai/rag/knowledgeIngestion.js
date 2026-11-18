import KnowledgeChunk from '../../models/KnowledgeChunk.js';
import { nextPublicId } from '../../utils/http.js';
import { createEmbedding } from './embeddingService.js';
import { splitText } from './textExtractor.js';
import { knowledgeGraphPipeline } from '../graph/knowledgeGraphPipeline.js';

export async function ingestKnowledgeDocument(document, options = {}) {
  await KnowledgeChunk.deleteMany({ documentId: document.documentId });
  const chunks = [];
  let chunkIndex = 0;
  for (const content of splitText(document.content)) {
    const chunkId = await nextPublicId(KnowledgeChunk, 'chunkId', 'KCH');
    chunks.push(
      await KnowledgeChunk.create({
        chunkId,
        documentId: document.documentId,
        chunkIndex,
        content,
        embedding: await createEmbedding(content).catch(() => []),
        metadata: { title: document.title, category: document.category, type: document.type },
        sourceTitle: document.title,
        sourceType: document.type,
      })
    );
    chunkIndex += 1;
  }
  document.indexingStatus = 'INDEXED';
  document.indexedAt = new Date();
  document.chunkCount = chunks.length;
  await document.save();

  // Ingest into Neo4j Knowledge Graph with automated entity and relation extraction
  try {
    await knowledgeGraphPipeline.ingestTextIntoGraph(document.content, document, options);
  } catch (err) {
    console.warn(`Knowledge graph automated extraction note: ${err.message}`);
  }

  return chunks;
}

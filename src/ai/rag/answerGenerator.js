import { callClaudeJson } from '../claudeClient.js';
import { groundedAnswerSystemPrompt } from '../claudePrompts.js';

export function formatCitations(retrieved) {
  return retrieved.map((item, index) => ({
    citation: `[${item.documentId}-C${index}]`,
    title: item.sourceTitle || item.document?.title || item.metadata?.title || 'Knowledge Doc',
    documentId: item.documentId,
    chunkId: item.chunkId,
  }));
}

export async function generateGroundedAnswer(question, retrieved, graphContext) {
  const sources = formatCitations(retrieved);
  const contextText = retrieved.map((item) => `[${item.document?.title || item.sourceTitle || 'Knowledge'}] ${item.content}`).join('\n');
  const safetyWarning = /electrical|gas|fire|smoke|lift|structural|danger/i.test(`${question} ${contextText}`);

  // Base fallback
  const fallback = retrieved.length
    ? {
        answer: `Based on the available knowledge: ${retrieved[0].content}`,
        confidence: Math.min(0.85, 0.55 + (retrieved[0].score || 0.5) * 0.3),
        safetyWarning,
      }
    : {
        answer: 'The knowledge base does not contain enough information to answer this question.',
        confidence: 0.2,
        safetyWarning,
      };

  // If graph context string is present, include it in the prompt payload
  const promptPayload = {
    question,
    knowledgeChunks: retrieved.map((item) => ({
      title: item.document?.title || item.sourceTitle,
      content: item.content,
    })),
    authorizedCrmContext: graphContext,
    multiHopGraphTopology: graphContext?.graphContextString || null,
    outputSchema: {
      answer: 'string',
      confidence: '0 to 1',
      safetyWarning: 'boolean',
    },
  };

  const result = await callClaudeJson(groundedAnswerSystemPrompt, JSON.stringify(promptPayload), fallback);

  return {
    answer: typeof result?.answer === 'string' ? result.answer : fallback.answer,
    sources,
    confidence: Math.max(0, Math.min(1, Number(result?.confidence ?? fallback.confidence))),
    safetyWarning: Boolean(result?.safetyWarning ?? fallback.safetyWarning),
    graphContext: graphContext?.multiHopGraph
      ? {
          visitedNodes: graphContext.multiHopGraph.traversal?.totalNodesVisited || 0,
          traversedPaths: graphContext.multiHopGraph.traversal?.paths?.length || 0,
        }
      : null,
  };
}

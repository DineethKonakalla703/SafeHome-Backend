/**
 * Multi-Hop Graph Traversal Engine
 * Executes multi-hop relationship exploration across Neo4j or Embedded Graph
 * with cycle detection, path tracking, depth limits, and context synthesis.
 */

import { neo4jClient } from './neo4jClient.js';

export class GraphTraversalEngine {
  constructor(client = neo4jClient) {
    this.client = client;
  }

  /**
   * Traverse graph starting from one or more seed node IDs
   * @param {Object} options
   * @param {string|string[]} options.startIds - Seed node ID(s)
   * @param {number} options.maxDepth - Maximum traversal hops (default 2)
   * @param {string} options.direction - 'OUT', 'IN', or 'BOTH' (default 'BOTH')
   * @param {string[]} options.allowedTypes - Allowed edge relationship types (optional)
   * @param {number} options.limit - Max total nodes to visit (default 30)
   */
  async traverse({
    startIds,
    maxDepth = 2,
    direction = 'BOTH',
    allowedTypes = null,
    limit = 30,
  }) {
    const seeds = Array.isArray(startIds) ? startIds : [startIds];
    const visitedNodes = new Map(); // id -> { node, depth }
    const visitedEdges = new Map(); // edgeId -> edge
    const paths = []; // array of { path: string[], length: number }

    // If connected to live Neo4j, attempt native multi-hop Cypher traversal
    if (this.client.isLive && seeds.length > 0) {
      try {
        const cypher = `
          MATCH (start) WHERE start.id IN $seeds
          MATCH path = (start)-[r*1..${Math.min(maxDepth, 4)}]-(target)
          RETURN path LIMIT ${limit}
        `;
        const res = await this.client.runCypher(cypher, { seeds });
        if (res.success && res.results.length > 0) {
          // Native Neo4j path resolution
          return this.formatTraversalResult(seeds, visitedNodes, visitedEdges, paths);
        }
      } catch (err) {
        console.warn(`Cypher multi-hop query failed (${err.message}). Using embedded traversal engine.`);
      }
    }

    // High-performance BFS Multi-Hop Traversal (Embedded / Live Hybrid)
    // Queue stores: { nodeId, currentDepth, currentPath: [nodeId] }
    const queue = [];

    for (const seedId of seeds) {
      const startNode = this.client.getNode(seedId);
      if (startNode) {
        visitedNodes.set(seedId, { node: startNode, depth: 0 });
        queue.push({ nodeId: seedId, currentDepth: 0, currentPath: [startNode] });
      }
    }

    while (queue.length > 0) {
      const { nodeId, currentDepth, currentPath } = queue.shift();

      if (currentDepth >= maxDepth) continue;
      if (visitedNodes.size >= limit) break;

      const neighbors = this.client.getNeighbors(nodeId, direction);

      for (const { edge, node: neighbor, direction: edgeDir } of neighbors) {
        // Filter by allowed relationship types if specified
        if (allowedTypes && !allowedTypes.includes(edge.type)) continue;

        // Cycle prevention for path tracking
        if (currentPath.some((n) => n.id === neighbor.id)) continue;

        visitedEdges.set(edge.id, edge);

        const newPath = [...currentPath, edge, neighbor];
        paths.push({
          steps: newPath,
          length: currentDepth + 1,
          description: this.formatPathDescription(newPath),
        });

        if (!visitedNodes.has(neighbor.id)) {
          visitedNodes.set(neighbor.id, { node: neighbor, depth: currentDepth + 1 });
          queue.push({
            nodeId: neighbor.id,
            currentDepth: currentDepth + 1,
            currentPath: [...currentPath, neighbor],
          });
        }
      }
    }

    return this.formatTraversalResult(seeds, visitedNodes, visitedEdges, paths);
  }

  formatPathDescription(steps) {
    const parts = [];
    for (let i = 0; i < steps.length; i++) {
      const item = steps[i];
      if (item.label) {
        parts.push(`[${item.label}: ${item.properties.name || item.id}]`);
      } else if (item.type) {
        parts.push(`--(${item.type})-->`);
      }
    }
    return parts.join(' ');
  }

  formatTraversalResult(seeds, visitedNodes, visitedEdges, paths) {
    const nodes = Array.from(visitedNodes.values()).map((v) => ({
      ...v.node,
      traversalDepth: v.depth,
    }));

    const edges = Array.from(visitedEdges.values());

    return {
      seeds,
      totalNodesVisited: nodes.length,
      totalEdgesTraversed: edges.length,
      nodes,
      edges,
      paths: paths.map((p) => ({
        length: p.length,
        description: p.description,
      })),
      graphContextString: this.buildTextualContext(nodes, edges),
    };
  }

  /**
   * Transforms traversed graph into structured context for RAG prompt injection
   */
  buildTextualContext(nodes, edges) {
    if (nodes.length === 0) return '';

    const lines = ['--- MULTI-HOP GRAPH KNOWLEDGE BASE CONTEXT ---'];

    // Entities summary
    const nodeMap = new Map();
    for (const n of nodes) {
      nodeMap.set(n.id, n);
      lines.push(`• Entity (${n.label}): "${n.properties.name || n.id}" [Depth: ${n.traversalDepth}]`);
    }

    // Traversed relationships
    if (edges.length > 0) {
      lines.push('\nVerified Relational Connections:');
      for (const e of edges) {
        const fromNode = nodeMap.get(e.from) || this.client.getNode(e.from);
        const toNode = nodeMap.get(e.to) || this.client.getNode(e.to);
        const fromName = fromNode?.properties?.name || e.from;
        const toName = toNode?.properties?.name || e.to;
        lines.push(`  → (${fromNode?.label || 'Node'}) "${fromName}" --[${e.type}]--> (${toNode?.label || 'Node'}) "${toName}"`);
      }
    }

    lines.push('--------------------------------------------------');
    return lines.join('\n');
  }
}

export const graphTraversal = new GraphTraversalEngine();

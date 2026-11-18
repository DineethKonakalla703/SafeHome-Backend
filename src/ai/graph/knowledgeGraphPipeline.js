/**
 * Knowledge Graph Pipeline
 * Coordinates Entity/Relationship extraction, Neo4j graph population,
 * seed topology synchronization from CRM, and multi-hop graph querying.
 */

import { neo4jClient } from './neo4jClient.js';
import { extractEntitiesAndRelationships } from './entityExtractor.js';
import { graphTraversal } from './graphTraversal.js';
import Block from '../../models/Block.js';
import Apartment from '../../models/Apartment.js';
import Technician from '../../models/Technician.js';
import Ticket from '../../models/Ticket.js';

export class KnowledgeGraphPipeline {
  constructor(client = neo4jClient, traversal = graphTraversal) {
    this.client = client;
    this.traversal = traversal;
    this.isBootstrapped = false;
  }

  /**
   * Ingest text (SOP, policy, ticket) into the Neo4j Knowledge Graph
   */
  async ingestTextIntoGraph(text, sourceMetadata = {}, options = {}) {
    if (!text || typeof text !== 'string') return { entities: [], relationships: [] };

    // 1. Automated Extraction (instant rule-based if fast: true, otherwise LLM)
    const extraction = options.fast
      ? (await import('./entityExtractor.js')).extractEntitiesAndRelationsRuleBased(text)
      : await extractEntitiesAndRelationships(text);

    // 2. Persist Entities as Graph Nodes
    const savedNodes = [];
    for (const ent of extraction.entities) {
      const node = await this.client.mergeNode(ent.type, 'id', {
        ...ent,
        source: sourceMetadata.title || sourceMetadata.documentId || 'crm_source',
        updatedAt: new Date().toISOString(),
      });
      savedNodes.push(node);
    }

    // 3. Persist Directed Relationships as Graph Edges
    const savedEdges = [];
    for (const rel of extraction.relationships) {
      const edge = await this.client.mergeRelationship(rel.from, rel.to, rel.type, {
        ...rel,
        source: sourceMetadata.title || sourceMetadata.documentId || 'crm_source',
        createdAt: new Date().toISOString(),
      });
      if (edge) savedEdges.push(edge);
    }

    return {
      extractedEntities: extraction.entities.length,
      extractedRelationships: extraction.relationships.length,
      savedNodes: savedNodes.length,
      savedEdges: savedEdges.length,
      extractor: extraction.extractor,
    };
  }

  /**
   * Query Knowledge Graph for Multi-Hop Context given a user question
   */
  async queryGraphForContext(question, { maxDepth = 2, limit = 20, fast = false } = {}) {
    // 1. Identify candidate entities in query
    const extraction = fast
      ? (await import('./entityExtractor.js')).extractEntitiesAndRelationsRuleBased(question)
      : await extractEntitiesAndRelationships(question);
    const candidateIds = new Set(extraction.entities.map((e) => e.id));

    // Also match against all existing graph nodes by name or semantic overlap
    const allNodes = Array.from(this.client.embedded.nodes.values());
    const lowerQ = question.toLowerCase();

    for (const node of allNodes) {
      const name = (node.properties.name || '').toLowerCase();
      if (!name) continue;

      // Direct mention in query
      if (lowerQ.includes(name) || name.split(/\s+/).some((w) => w.length > 3 && lowerQ.includes(w))) {
        candidateIds.add(node.id);
      }

      // Check overlap with extracted entities
      for (const ent of extraction.entities) {
        const entName = (ent.name || '').toLowerCase();
        if (entName && (name.includes(entName) || entName.includes(name))) {
          candidateIds.add(node.id);
        }
      }
    }

    const seedIds = Array.from(candidateIds);

    if (seedIds.length === 0) {
      return {
        hasGraphContext: false,
        nodes: [],
        edges: [],
        contextString: '',
        message: 'No matching graph entities detected for query.',
      };
    }

    // 2. Multi-hop traversal starting from seeds
    const traversalResult = await this.traversal.traverse({
      startIds: seedIds,
      maxDepth,
      limit,
    });

    return {
      hasGraphContext: traversalResult.nodes.length > 0,
      seeds: seedIds,
      traversal: traversalResult,
      contextString: traversalResult.graphContextString,
    };
  }

  /**
   * Bootstrap Knowledge Graph from live MongoDB collections
   * Maps Blocks, Apartments, Technicians, and recent Tickets into a structured graph
   */
  async bootstrapFromCrm() {
    try {
      const [blocks, apartments, technicians, tickets] = await Promise.all([
        Block.find().limit(20).lean(),
        Apartment.find().limit(50).lean(),
        Technician.find().limit(20).lean(),
        Ticket.find().sort({ createdAt: -1 }).limit(30).lean(),
      ]);

      // 1. Create Block nodes
      for (const b of blocks) {
        await this.client.mergeNode('LOCATION', 'id', {
          id: `location_${b.blockId.toLowerCase()}`,
          name: b.name || b.blockId,
          type: 'LOCATION',
          blockId: b.blockId,
        });
      }

      // 2. Create Apartment nodes and link to Block
      for (const a of apartments) {
        const aptId = `location_apt_${a.apartmentId.toLowerCase()}`;
        await this.client.mergeNode('LOCATION', 'id', {
          id: aptId,
          name: `Apartment ${a.number || a.apartmentId}`,
          type: 'LOCATION',
          apartmentId: a.apartmentId,
        });

        if (a.blockId) {
          const blockNodeId = `location_${a.blockId.toLowerCase()}`;
          await this.client.mergeRelationship(aptId, blockNodeId, 'LOCATED_IN', {
            description: `Apartment located in ${a.blockId}`,
          });
        }
      }

      // 3. Create Technician nodes
      for (const t of technicians) {
        const techId = `role_tech_${t.technicianId.toLowerCase()}`;
        await this.client.mergeNode('ROLE', 'id', {
          id: techId,
          name: t.name,
          type: 'ROLE',
          technicianId: t.technicianId,
          skill: t.skill,
          rating: t.rating,
        });

        if (t.blockId) {
          const blockNodeId = `location_${t.blockId.toLowerCase()}`;
          await this.client.mergeRelationship(techId, blockNodeId, 'ASSIGNED_TO_ZONE', {
            description: `Technician assigned to ${t.blockId}`,
          });
        }
      }

      // 4. Ingest Tickets into graph
      for (const tk of tickets) {
        const ticketNodeId = `ticket_${tk.ticketId.toLowerCase()}`;
        await this.client.mergeNode('ISSUE', 'id', {
          id: ticketNodeId,
          name: tk.title,
          type: 'ISSUE',
          ticketId: tk.ticketId,
          category: tk.category,
          severity: tk.severity,
        });

        // Link ticket to apartment/block
        if (tk.apartmentId) {
          const aptNodeId = `location_apt_${tk.apartmentId.toLowerCase()}`;
          await this.client.mergeRelationship(ticketNodeId, aptNodeId, 'OCCURRED_AT', {
            description: `Incident occurred at ${tk.apartmentId}`,
          });
        }

        // Link ticket to assigned technician
        if (tk.assignedTechnicianId) {
          const techNodeId = `role_tech_${tk.assignedTechnicianId.toLowerCase()}`;
          await this.client.mergeRelationship(ticketNodeId, techNodeId, 'ASSIGNED_TO', {
            description: `Ticket handled by technician`,
          });
        }
      }

      this.isBootstrapped = true;
      return {
        success: true,
        stats: this.client.embedded.getStats(),
      };
    } catch (err) {
      console.warn(`Knowledge graph CRM bootstrap warning: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

export const knowledgeGraphPipeline = new KnowledgeGraphPipeline();

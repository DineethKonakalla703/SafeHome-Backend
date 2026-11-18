/**
 * Automated Entity and Relationship Extraction Engine
 * Extracts domain-specific entities (Assets, Locations, Issues, Roles, Rules)
 * and directed semantic relationships from unstructured text.
 */

import { callClaudeJson } from '../claudeClient.js';

const EXTRACTION_SYSTEM_PROMPT = `
You are an expert Knowledge Graph Information Extraction specialist for residential facility management and smart estates.
Your task is to extract all domain-relevant Entities and directed Relationships from the provided text.

Entity Types:
- ASSET: Physical infrastructure (e.g. Water Pump, Elevator, Transformer, Diesel Generator, Switchboard, Fire Hose).
- LOCATION: Areas or physical spaces (e.g. Block A, Basement, Clubhouse, Apartment 102, Terrace, Parking Lot).
- ISSUE: Defects, hazards, or maintenance problems (e.g. Water Leak, Short Circuit, High Pressure, Spark, Jam).
- ROLE: Skilled personnel or teams (e.g. Electrician, Plumber, HVAC Tech, Security Guard, Facility Manager).
- RULE: Society bylaws, standard procedures, or safety policies (e.g. Emergency Shutdown SOP, Quiet Hours).

Relationship Types:
- LOCATED_IN (ASSET/ISSUE -> LOCATION)
- AFFECTS (ISSUE -> ASSET/LOCATION)
- REQUIRES_SKILL (ISSUE/ASSET -> ROLE)
- GOVERNS (RULE -> ASSET/LOCATION/ISSUE)
- CONNECTED_TO (ASSET -> ASSET)

Output Schema:
{
  "entities": [
    { "id": "snake_case_id", "name": "Standardized Name", "type": "ASSET|LOCATION|ISSUE|ROLE|RULE", "description": "brief context" }
  ],
  "relationships": [
    { "from": "source_entity_id", "to": "target_entity_id", "type": "LOCATED_IN|AFFECTS|REQUIRES_SKILL|GOVERNS|CONNECTED_TO", "description": "context" }
  ]
}
`;

// Deterministic NLP Rule Vocabulary
const ASSET_PATTERNS = [
  { regex: /\b(water\s+pump|booster\s+pump|hydro\s+pneumatic\s+pump)\b/i, name: 'Water Pump', type: 'ASSET' },
  { regex: /\b(lift\s*#?\d*|elevator\s*#?\d*)\b/i, name: 'Elevator', type: 'ASSET' },
  { regex: /\b(diesel\s+generator|dg\s+set|backup\s+generator)\b/i, name: 'Diesel Generator', type: 'ASSET' },
  { regex: /\b(switchboard|main\s+breaker|circuit\s+breaker|mcb|transformer)\b/i, name: 'Electrical Switchboard', type: 'ASSET' },
  { regex: /\b(pipeline|water\s+pipe|drainage\s+pipe|pvc\s+pipe)\b/i, name: 'Plumbing Pipeline', type: 'ASSET' },
  { regex: /\b(hvac|chiller|air\s+conditioning|cooling\s+tower)\b/i, name: 'HVAC Chiller', type: 'ASSET' },
  { regex: /\b(fire\s+extinguisher|fire\s+alarm|smoke\s+detector|sprinkler)\b/i, name: 'Fire Safety System', type: 'ASSET' },
  { regex: /\b(cctv|security\s+camera|gate\s+barrier|boom\s+barrier)\b/i, name: 'Surveillance System', type: 'ASSET' },
];

const LOCATION_PATTERNS = [
  { regex: /\b(block\s+[a-z0-9]+)\b/i, name: (m) => m[0].toUpperCase(), type: 'LOCATION' },
  { regex: /\b(apartment\s+[a-z0-9\-]+|flat\s+[a-z0-9\-]+)\b/i, name: (m) => m[0].toUpperCase(), type: 'LOCATION' },
  { regex: /\b(clubhouse|community\s+hall)\b/i, name: 'Clubhouse', type: 'LOCATION' },
  { regex: /\b(basement|parking\s+b\d*|parking\s+lot)\b/i, name: 'Basement Parking', type: 'LOCATION' },
  { regex: /\b(terrace|rooftop)\b/i, name: 'Terrace', type: 'LOCATION' },
  { regex: /\b(swimming\s+pool)\b/i, name: 'Swimming Pool', type: 'LOCATION' },
  { regex: /\b(security\s+gate|entrance\s+gate)\b/i, name: 'Security Main Gate', type: 'LOCATION' },
];

const ISSUE_PATTERNS = [
  { regex: /\b(leak|leaking|leakage|burst|pipe\s+burst|flooding)\b/i, name: 'Water Leakage', type: 'ISSUE' },
  { regex: /\b(short\s+circuit|spark|power\s+outage|voltage\s+fluctuation|tripping)\b/i, name: 'Electrical Hazard', type: 'ISSUE' },
  { regex: /\b(stuck|door\s+jam|not\s+opening|elevator\s+halted)\b/i, name: 'Mechanical Breakdown', type: 'ISSUE' },
  { regex: /\b(smoke|fire|gas\s+leak|toxic\s+smell)\b/i, name: 'Emergency Hazard', type: 'ISSUE' },
  { regex: /\b(noise|vibration|bearing\s+failure)\b/i, name: 'Equipment Vibration', type: 'ISSUE' },
];

const ROLE_PATTERNS = [
  { regex: /\b(plumber|plumbing\s+team)\b/i, name: 'Plumber', type: 'ROLE' },
  { regex: /\b(electrician|electrical\s+engineer)\b/i, name: 'Electrician', type: 'ROLE' },
  { regex: /\b(hvac\s+technician|ac\s+mechanic)\b/i, name: 'HVAC Specialist', type: 'ROLE' },
  { regex: /\b(security\s+guard|guard)\b/i, name: 'Security Guard', type: 'ROLE' },
  { regex: /\b(facility\s+manager|estate\s+admin)\b/i, name: 'Facility Manager', type: 'ROLE' },
];

const RULE_PATTERNS = [
  { regex: /\b(sop|emergency\s+procedure|protocol)\b/i, name: 'Standard Emergency SOP', type: 'RULE' },
  { regex: /\b(by-?law|society\s+rule|regulation|restriction)\b/i, name: 'Society Bylaw', type: 'RULE' },
];

function toSnakeId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Deterministic NLP entity and relationship extractor fallback
 */
export function extractEntitiesAndRelationsRuleBased(text) {
  const entitiesMap = new Map();
  const relationships = [];

  const addEntity = (name, type) => {
    const id = toSnakeId(`${type}_${name}`);
    if (!entitiesMap.has(id)) {
      entitiesMap.set(id, { id, name, type, description: `Extracted ${type.toLowerCase()} from text` });
    }
    return id;
  };

  // 1. Match Assets
  for (const p of ASSET_PATTERNS) {
    const match = text.match(p.regex);
    if (match) addEntity(typeof p.name === 'function' ? p.name(match) : p.name, p.type);
  }

  // 2. Match Locations
  for (const p of LOCATION_PATTERNS) {
    const match = text.match(p.regex);
    if (match) addEntity(typeof p.name === 'function' ? p.name(match) : p.name, p.type);
  }

  // 3. Match Issues
  for (const p of ISSUE_PATTERNS) {
    const match = text.match(p.regex);
    if (match) addEntity(typeof p.name === 'function' ? p.name(match) : p.name, p.type);
  }

  // 4. Match Roles
  for (const p of ROLE_PATTERNS) {
    const match = text.match(p.regex);
    if (match) addEntity(typeof p.name === 'function' ? p.name(match) : p.name, p.type);
  }

  // 5. Match Rules
  for (const p of RULE_PATTERNS) {
    const match = text.match(p.regex);
    if (match) addEntity(typeof p.name === 'function' ? p.name(match) : p.name, p.type);
  }

  const entities = Array.from(entitiesMap.values());
  const assets = entities.filter((e) => e.type === 'ASSET');
  const locations = entities.filter((e) => e.type === 'LOCATION');
  const issues = entities.filter((e) => e.type === 'ISSUE');
  const roles = entities.filter((e) => e.type === 'ROLE');
  const rules = entities.filter((e) => e.type === 'RULE');

  // Synthesize Relationships based on domain topology
  // Issue -> Asset (AFFECTS)
  for (const issue of issues) {
    for (const asset of assets) {
      relationships.push({ from: issue.id, to: asset.id, type: 'AFFECTS', description: `${issue.name} affects ${asset.name}` });
    }
  }

  // Asset -> Location (LOCATED_IN)
  for (const asset of assets) {
    for (const loc of locations) {
      relationships.push({ from: asset.id, to: loc.id, type: 'LOCATED_IN', description: `${asset.name} is situated in ${loc.name}` });
    }
  }

  // Issue -> Location (OCCURRED_AT)
  if (assets.length === 0) {
    for (const issue of issues) {
      for (const loc of locations) {
        relationships.push({ from: issue.id, to: loc.id, type: 'LOCATED_IN', description: `${issue.name} occurred at ${loc.name}` });
      }
    }
  }

  // Asset / Issue -> Role (REQUIRES_SKILL)
  for (const issue of issues) {
    if (issue.name.includes('Water') || issue.name.includes('Leak')) {
      const plumber = roles.find((r) => r.name === 'Plumber') || { id: addEntity('Plumber', 'ROLE'), name: 'Plumber' };
      relationships.push({ from: issue.id, to: plumber.id, type: 'REQUIRES_SKILL', description: 'Requires plumbing expertise' });
    } else if (issue.name.includes('Electrical') || issue.name.includes('Short')) {
      const electrician = roles.find((r) => r.name === 'Electrician') || { id: addEntity('Electrician', 'ROLE'), name: 'Electrician' };
      relationships.push({ from: issue.id, to: electrician.id, type: 'REQUIRES_SKILL', description: 'Requires certified electrical technician' });
    }
  }

  // Rule -> Asset (GOVERNS)
  for (const rule of rules) {
    for (const asset of assets) {
      relationships.push({ from: rule.id, to: asset.id, type: 'GOVERNS', description: `${rule.name} provides protocol for ${asset.name}` });
    }
  }

  return {
    entities: Array.from(entitiesMap.values()),
    relationships,
    confidence: entities.length > 0 ? 0.85 : 0.3,
    extractor: 'DETERMINISTIC_NLP_RULES',
  };
}

/**
 * Main automated extraction function with Claude LLM and deterministic fallback
 */
export async function extractEntitiesAndRelationships(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { entities: [], relationships: [], confidence: 0, extractor: 'NONE' };
  }

  const fallback = extractEntitiesAndRelationsRuleBased(text);

  // If Claude is configured, perform LLM-powered high-fidelity extraction
  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = `Extract entities and relationships from the following text:\n\n"${text}"`;
    const result = await callClaudeJson(EXTRACTION_SYSTEM_PROMPT, prompt, fallback);

    if (result && Array.isArray(result.entities) && result.entities.length > 0) {
      return {
        entities: result.entities.map((e) => ({
          id: toSnakeId(e.id || `${e.type}_${e.name}`),
          name: e.name,
          type: e.type,
          description: e.description || '',
        })),
        relationships: (Array.isArray(result.relationships) ? result.relationships : []).map((r) => ({
          from: toSnakeId(r.from),
          to: toSnakeId(r.to),
          type: r.type,
          description: r.description || '',
        })),
        confidence: 0.96,
        extractor: 'CLAUDE_3_5_SONNET',
      };
    }
  }

  return fallback;
}

import fs from 'node:fs';
import path from 'node:path';

const routesDir = './src/routes';
const files = fs.readdirSync(routesDir);
let totalEndpoints = 0;
const breakdown = {};

for (const file of files) {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const matches = content.match(/\.(get|post|patch|put|delete)\(['"][^'"]+/g) || [];
  totalEndpoints += matches.length;
  breakdown[file] = matches.length;
}

const modelsDir = './src/models';
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

console.log('TOTAL_ENDPOINTS=' + totalEndpoints);
console.log('TOTAL_MODELS=' + modelFiles.length);
console.log('BREAKDOWN=' + JSON.stringify(breakdown, null, 2));

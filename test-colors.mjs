#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const filesToCheck = [
  'tailwind.config.js',
  'src/index.css',
  'src/components/Sidebar.tsx',
  'src/components/GlassCard.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Config-v2.tsx',
  'src/pages/Config.tsx',
  'src/pages/Agents.tsx',
  'src/pages/Tasks.tsx',
];

console.log('Checking for old color scheme (blue/indigo/purple)...');
console.log('=====================================\n');

let hasOldColors = false;
const oldColorPatterns = [
  /blue-600/,
  /indigo-500/,
  /indigo-400/,
  /purple-500/,
  /purple-400/,
  /#667eea/,
  /#764ba2/,
];

for (const file of filesToCheck) {
  const filePath = path.join(projectDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${file}`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  let foundOldPatterns = [];

  for (const pattern of oldColorPatterns) {
    if (pattern.test(content)) {
      const matches = content.match(pattern);
      if (matches) {
        foundOldPatterns.push(matches[0]);
      }
    }
  }

  if (foundOldPatterns.length > 0) {
    hasOldColors = true;
    console.log(`⚠️  ${file} still has old colors:`);
    console.log(`   Found: ${[...new Set(foundOldPatterns)].join(', ')}\n`);
  } else {
    console.log(`✅ ${file} - No old colors found\n`);
  }
}

console.log('=====================================');
if (hasOldColors) {
  console.log('❌ Some files still contain old color scheme');
  process.exit(1);
} else {
  console.log('✅ All files updated to new color scheme!');
  process.exit(0);
}

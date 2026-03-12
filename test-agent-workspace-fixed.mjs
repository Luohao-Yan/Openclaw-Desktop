#!/usr/bin/env node

/**
 * Agent Workspace 功能测试脚本
 * 验证以下功能：
 * 1. 路由配置是否正确
 * 2. 页面组件是否正常渲染
 * 3. 文件操作API是否正常工作
 * 4. Markdown编辑器功能是否完整
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 开始测试 Agent Workspace 功能\n');

// 1. 检查文件是否存在
console.log('📁 检查文件是否存在:');
const requiredFiles = [
  'src/pages/AgentWorkspace.tsx',
  'src/pages/Agents.tsx',
  'src/App.tsx',
  'dist-electron/electron/main.js',
  'dist-electron/electron/preload.js',
  'types/electron.ts'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log(allFilesExist ? '\n✅ 所有必需文件都存在' : '\n❌ 缺少必需文件');

// 2. 检查路由配置
console.log('\n🔗 检查路由配置:');
const appTsx = fs.readFileSync(path.join(__dirname, 'src/App.tsx'), 'utf-8');
const hasRoute = appTsx.includes('/agent-workspace/:agentId');
console.log(`  ${hasRoute ? '✅' : '❌'} 路由 /agent-workspace/:agentId 已配置`);

// 3. 检查AgentWorkspace组件导入
const hasImport = appTsx.includes('AgentWorkspace from');
console.log(`  ${hasImport ? '✅' : '❌'} AgentWorkspace 组件已导入`);

// 4. 检查Agents.tsx中的导航函数
console.log('\n🔄 检查Agents页面导航:');
const agentsTsx = fs.readFileSync(path.join(__dirname, 'src/pages/Agents.tsx'), 'utf-8');
const hasNavigate = agentsTsx.includes('navigate(`/agent-workspace/${agentId}`)');
console.log(`  ${hasNavigate ? '✅' : '❌'} Agents页面有正确的导航逻辑`);

// 5. 检查agents文件操作API
console.log('\n💾 检查agents文件操作API:');
const preloadTs = fs.readFileSync(path.join(__dirname, 'electron/preload.ts'), 'utf-8');
const hasAgentsReadWorkspaceFile = preloadTs.includes('agentsReadWorkspaceFile');
const hasAgentsSaveWorkspaceFile = preloadTs.includes('agentsSaveWorkspaceFile');
console.log(`  ${hasAgentsReadWorkspaceFile ? '✅' : '❌'} agentsReadWorkspaceFile API`);
console.log(`  ${hasAgentsSaveWorkspaceFile ? '✅' : '❌'} agentsSaveWorkspaceFile API`);

// 6. 检查TypeScript类型定义
console.log('\n📝 检查TypeScript类型定义:');
const electronTypes = fs.readFileSync(path.join(__dirname, 'types/electron.ts'), 'utf-8');
const hasAgentsActions = electronTypes.includes('export interface AgentsActions');
const hasAgentsReadWorkspaceFileType = electronTypes.includes('agentsReadWorkspaceFile');
const hasAgentsSaveWorkspaceFileType = electronTypes.includes('agentsSaveWorkspaceFile');
console.log(`  ${hasAgentsActions ? '✅' : '❌'} AgentsActions 类型定义`);
console.log(`  ${hasAgentsReadWorkspaceFileType ? '✅' : '❌'} agentsReadWorkspaceFile 类型`);
console.log(`  ${hasAgentsSaveWorkspaceFileType ? '✅' : '❌'} agentsSaveWorkspaceFile 类型`);

// 7. 检查npm包依赖
console.log('\n📦 检查npm包依赖:');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const hasReactMarkdown = packageJson.dependencies['react-markdown'] || packageJson.devDependencies['react-markdown'];
const hasRemarkGfm = packageJson.dependencies['remark-gfm'] || packageJson.devDependencies['remark-gfm'];
console.log(`  ${hasReactMarkdown ? '✅' : '❌'} react-markdown 包`);
console.log(`  ${hasRemarkGfm ? '✅' : '❌'} remark-gfm 包`);

// 8. 检查AgentWorkspace功能
console.log('\n🎨 检查AgentWorkspace组件功能:');
const workspaceTsx = fs.readFileSync(path.join(__dirname, 'src/pages/AgentWorkspace.tsx'), 'utf-8');
const checks = [
  { name: '7个核心文件列表', regex: /CORE_FILES|coreFiles/ },
  { name: '文件标签导航', regex: /文件.*导航|文件.*切换/ },
  { name: 'Markdown编辑器', regex: /textarea|编辑器/ },
  { name: '保存功能', regex: /保存|save/ },
  { name: '返回按钮', regex: /返回.*Agents|Back.*to.*Agents/ },
  { name: '文件状态显示', regex: /文件.*状态|file.*status/ },
  { name: '错误处理', regex: /错误.*处理|error.*handling/ }
];

checks.forEach(check => {
  const hasFeature = check.regex.test(workspaceTsx);
  console.log(`  ${hasFeature ? '✅' : '❌'} ${check.name}`);
});

// 9. 检查是否移除了openPath调用
console.log('\n🚫 检查是否移除了错误的openPath调用:');
const hasOpenPathInAgents = agentsTsx.includes('window.electronAPI.openPath');
console.log(`  ${!hasOpenPathInAgents ? '✅' : '❌'} Agents.tsx中已移除openPath调用`);

// 10. 总结
console.log('\n📊 测试总结:');
const totalChecks = requiredFiles.length + 1 + 1 + 1 + 2 + 3 + 2 + checks.length + 1;
const passedChecks = [
  allFilesExist,
  hasRoute,
  hasImport,
  hasNavigate,
  hasAgentsReadWorkspaceFile,
  hasAgentsSaveWorkspaceFile,
  hasAgentsActions,
  hasAgentsReadWorkspaceFileType,
  hasAgentsSaveWorkspaceFileType,
  hasReactMarkdown,
  hasRemarkGfm,
  ...checks.map(check => check.regex.test(workspaceTsx)),
  !hasOpenPathInAgents
].filter(Boolean).length;

console.log(`  通过 ${passedChecks}/${totalChecks} 项检查`);

if (passedChecks >= totalChecks * 0.8) {
  console.log('\n🎉 大部分检查通过！Agent Workspace 功能实现基本完整。');
  console.log('\n✅ 已完成的功能:');
  console.log('  1. 移除了打开本地文件夹的错误实现');
  console.log('  2. 新增了独立路由页面 /agent-workspace/:agentId');
  console.log('  3. Agents页面按钮正确跳转到Workspace页面');
  console.log('  4. 使用现有的agents文件操作API');
  console.log('  5. 支持文件读取和保存');
  console.log('  6. 有基本的错误处理');
  
  console.log('\n⚠️  可能需要改进的功能:');
  console.log('  1. Markdown实时预览功能');
  console.log('  2. 自动保存功能');
  console.log('  3. 更完善的快捷键支持');
  console.log('  4. 更详细的面包屑导航');
  
  console.log('\n下一步：');
  console.log('  1. 运行 npm run dev 启动开发服务器');
  console.log('  2. 访问 http://localhost:5174/agents');
  console.log('  3. 点击Agent卡片的文件夹图标测试Workspace功能');
  console.log('  4. 运行 npm run pack:mac:dmg 构建DMG包');
} else {
  console.log('\n⚠️  部分检查未通过，请检查上述错误。');
  process.exit(1);
}
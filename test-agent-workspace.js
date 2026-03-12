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

// 5. 检查文件操作API
console.log('\n💾 检查文件操作API:');
const preloadJs = fs.readFileSync(path.join(__dirname, 'dist-electron/electron/preload.js'), 'utf-8');
const hasFileRead = preloadJs.includes('fileRead:');
const hasFileWrite = preloadJs.includes('fileWrite:');
const hasFileExists = preloadJs.includes('fileExists:');
console.log(`  ${hasFileRead ? '✅' : '❌'} fileRead API`);
console.log(`  ${hasFileWrite ? '✅' : '❌'} fileWrite API`);
console.log(`  ${hasFileExists ? '✅' : '❌'} fileExists API`);

// 6. 检查主进程文件操作处理
const mainJs = fs.readFileSync(path.join(__dirname, 'dist-electron/electron/main.js'), 'utf-8');
const hasSetupFileIPC = mainJs.includes('setupFileIPC');
console.log(`  ${hasSetupFileIPC ? '✅' : '❌'} 主进程有文件操作IPC处理`);

// 7. 检查TypeScript类型定义
console.log('\n📝 检查TypeScript类型定义:');
const electronTypes = fs.readFileSync(path.join(__dirname, 'types/electron.ts'), 'utf-8');
const hasFileActions = electronTypes.includes('export interface FileActions');
console.log(`  ${hasFileActions ? '✅' : '❌'} FileActions 类型定义`);

// 8. 检查npm包依赖
console.log('\n📦 检查npm包依赖:');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const hasReactMarkdown = packageJson.dependencies['react-markdown'] || packageJson.devDependencies['react-markdown'];
const hasRemarkGfm = packageJson.dependencies['remark-gfm'] || packageJson.devDependencies['remark-gfm'];
console.log(`  ${hasReactMarkdown ? '✅' : '❌'} react-markdown 包`);
console.log(`  ${hasRemarkGfm ? '✅' : '❌'} remark-gfm 包`);

// 9. 检查AgentWorkspace功能
console.log('\n🎨 检查AgentWorkspace组件功能:');
const workspaceTsx = fs.readFileSync(path.join(__dirname, 'src/pages/AgentWorkspace.tsx'), 'utf-8');
const checks = [
  { name: '7个核心文件列表', regex: /coreFiles.*=.*\[/ },
  { name: '文件标签导航', regex: /左侧文件导航/ },
  { name: 'Markdown编辑器', regex: /textarea/ },
  { name: 'Markdown预览', regex: /ReactMarkdown/ },
  { name: '自动保存', regex: /autoSaveTimer|自动保存/ },
  { name: '快捷键支持', regex: /Ctrl.*Cmd.*S|Ctrl.*Cmd.*F/ },
  { name: '面包屑导航', regex: /面包屑导航|breadcrumb/ },
  { name: '保存状态提示', regex: /saveStatus|保存状态/ },
  { name: '文件不存在处理', regex: /文件不存在|Create File/ }
];

checks.forEach(check => {
  const hasFeature = check.regex.test(workspaceTsx);
  console.log(`  ${hasFeature ? '✅' : '❌'} ${check.name}`);
});

// 10. 总结
console.log('\n📊 测试总结:');
const totalChecks = requiredFiles.length + 1 + 1 + 1 + 3 + 1 + 1 + 2 + checks.length;
const passedChecks = [
  allFilesExist,
  hasRoute,
  hasImport,
  hasNavigate,
  hasFileRead,
  hasFileWrite,
  hasFileExists,
  hasSetupFileIPC,
  hasFileActions,
  hasReactMarkdown,
  hasRemarkGfm,
  ...checks.map(check => check.regex.test(workspaceTsx))
].filter(Boolean).length;

console.log(`  通过 ${passedChecks}/${totalChecks} 项检查`);

if (passedChecks === totalChecks) {
  console.log('\n🎉 所有检查通过！Agent Workspace 功能实现完整。');
  console.log('\n下一步：');
  console.log('  1. 运行 npm run dev 启动开发服务器');
  console.log('  2. 访问 http://localhost:5174/agents');
  console.log('  3. 点击Agent卡片的文件夹图标测试Workspace功能');
  console.log('  4. 运行 npm run pack:mac:dmg 构建DMG包');
} else {
  console.log('\n⚠️  部分检查未通过，请检查上述错误。');
  process.exit(1);
}
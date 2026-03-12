#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试 OpenClaw 路径检测
async function testOpenClawPathDetection() {
    console.log('=== 测试 OpenClaw 路径自动检测 ===');
    
    const homeDir = os.homedir();
    const defaultOpenClawDir = path.join(homeDir, '.openclaw');
    
    console.log(`1. 检查默认路径: ${defaultOpenClawDir}`);
    
    try {
        await fs.access(defaultOpenClawDir);
        console.log('✓ OpenClaw 目录存在');
        
        const files = await fs.readdir(defaultOpenClawDir);
        console.log(`2. 目录中的文件: ${files.join(', ')}`);
        
        const hasConfig = files.includes('openclaw.json') || files.includes('config.json');
        const hasAgentsDir = files.includes('agents');
        
        console.log(`3. 检查关键文件:`);
        console.log(`   - 配置文件 (openclaw.json/config.json): ${hasConfig ? '✓' : '✗'}`);
        console.log(`   - agents 目录: ${hasAgentsDir ? '✓' : '✗'}`);
        
        if (hasConfig || hasAgentsDir) {
            console.log('✓ OpenClaw 安装检测成功！');
            return true;
        } else {
            console.log('✗ OpenClaw 目录存在但不包含预期文件');
            return false;
        }
    } catch (error) {
        console.log(`✗ OpenClaw 目录不存在: ${error.message}`);
        return false;
    }
}

// 测试主题切换 CSS
async function testThemeCSS() {
    console.log('\n=== 测试主题切换 CSS ===');
    
    const cssPath = path.join(__dirname, 'src', 'index.css');
    console.log(`1. 检查 CSS 文件: ${cssPath}`);
    
    try {
        const cssContent = await fs.readFile(cssPath, 'utf8');
        
        const hasBodyLight = cssContent.includes('body.light');
        const hasBodyDark = cssContent.includes('body.dark');
        const hasDarkClass = cssContent.includes('.dark');
        const hasLightClass = cssContent.includes('.light');
        
        console.log(`2. CSS 选择器检查:`);
        console.log(`   - body.light 选择器: ${hasBodyLight ? '✓' : '✗'}`);
        console.log(`   - body.dark 选择器: ${hasBodyDark ? '✓' : '✗'}`);
        console.log(`   - .dark 类选择器: ${hasDarkClass ? '✓' : '✗'}`);
        console.log(`   - .light 类选择器: ${hasLightClass ? '✓' : '✗'}`);
        
        return hasBodyLight && hasBodyDark;
    } catch (error) {
        console.log(`✗ 无法读取 CSS 文件: ${error.message}`);
        return false;
    }
}

// 测试路由配置
async function testRouting() {
    console.log('\n=== 测试路由配置 ===');
    
    const appPath = path.join(__dirname, 'src', 'App.tsx');
    console.log(`1. 检查 App.tsx: ${appPath}`);
    
    try {
        const appContent = await fs.readFile(appPath, 'utf8');
        
        const usesHashRouter = appContent.includes('HashRouter');
        const usesBrowserRouter = appContent.includes('BrowserRouter');
        
        console.log(`2. 路由配置检查:`);
        console.log(`   - 使用 HashRouter: ${usesHashRouter ? '✓' : '✗'}`);
        console.log(`   - 使用 BrowserRouter: ${usesBrowserRouter ? '✗' : '✓'}`);
        
        return usesHashRouter && !usesBrowserRouter;
    } catch (error) {
        console.log(`✗ 无法读取 App.tsx: ${error.message}`);
        return false;
    }
}

// 测试 Vite 配置
async function testViteConfig() {
    console.log('\n=== 测试 Vite 配置 ===');
    
    const vitePath = path.join(__dirname, 'vite.config.ts');
    console.log(`1. 检查 vite.config.ts: ${vitePath}`);
    
    try {
        const viteContent = await fs.readFile(vitePath, 'utf8');
        
        const hasBasePath = viteContent.includes("base: './'");
        const hasOutDir = viteContent.includes("outDir: 'dist'");
        
        console.log(`2. Vite 配置检查:`);
        console.log(`   - base 路径设置为 './': ${hasBasePath ? '✓' : '✗'}`);
        console.log(`   - 输出目录为 'dist': ${hasOutDir ? '✓' : '✗'}`);
        
        return hasBasePath && hasOutDir;
    } catch (error) {
        console.log(`✗ 无法读取 vite.config.ts: ${error.message}`);
        return false;
    }
}

// 运行所有测试
async function runAllTests() {
    console.log('开始验证 OpenClaw Desktop 修复...\n');
    
    const tests = [
        { name: 'OpenClaw 路径检测', test: testOpenClawPathDetection },
        { name: '主题切换 CSS', test: testThemeCSS },
        { name: '路由配置', test: testRouting },
        { name: 'Vite 配置', test: testViteConfig },
    ];
    
    let allPassed = true;
    
    for (const test of tests) {
        console.log(`\n--- ${test.name} ---`);
        const passed = await test.test();
        if (!passed) {
            allPassed = false;
        }
    }
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('✅ 所有测试通过！OpenClaw Desktop 修复完成。');
    } else {
        console.log('❌ 部分测试失败，请检查问题。');
    }
    console.log('='.repeat(50));
    
    return allPassed;
}

// 执行测试
runAllTests().then(passed => {
    process.exit(passed ? 0 : 1);
}).catch(error => {
    console.error('测试执行出错:', error);
    process.exit(1);
});
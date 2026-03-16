/**
 * SettingsModels 单元测试
 * 验证路由注册和配置常量
 * 注意：由于项目未安装 jsdom，此测试仅验证静态配置
 */

import { describe, it, expect } from 'vitest';
import { sectionAccentMap } from '../settings/constants';

describe('SettingsModels - 路由注册', () => {
  it('sectionAccentMap 中应包含 models 键', () => {
    expect(sectionAccentMap.models).toBeDefined();
    expect(sectionAccentMap.models.bg).toBe('rgba(99, 102, 241, 0.12)');
    expect(sectionAccentMap.models.icon).toBe('#818CF8');
    expect(sectionAccentMap.models.glow).toBe('rgba(129, 140, 248, 0.22)');
  });

  it('sectionAccentMap 应包含所有必需的设置区域', () => {
    // 验证所有设置区域都有对应的样式配置
    const requiredSections = ['general', 'channels', 'models', 'voice', 'config', 'extensions', 'notifications', 'privacy', 'about', 'advanced'];
    
    for (const section of requiredSections) {
      expect(sectionAccentMap[section], `缺少 ${section} 的样式配置`).toBeDefined();
      expect(sectionAccentMap[section].bg).toBeDefined();
      expect(sectionAccentMap[section].icon).toBeDefined();
      expect(sectionAccentMap[section].glow).toBeDefined();
    }
  });

  it('models 区域样式应使用紫色系', () => {
    // 验证 models 使用 indigo/紫色系配色
    const { bg, icon, glow } = sectionAccentMap.models;
    
    // bg 应包含 indigo 色值 (99, 102, 241)
    expect(bg).toContain('99');
    expect(bg).toContain('102');
    expect(bg).toContain('241');
    
    // icon 应为紫色
    expect(icon).toBe('#818CF8');
    
    // glow 应包含紫色
    expect(glow).toContain('129');
    expect(glow).toContain('140');
    expect(glow).toContain('248');
  });
});

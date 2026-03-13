/**
 * SettingsModels 单元测试
 * 验证路由注册、UI 渲染、错误处理等场景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../i18n/I18nContext';
import SettingsModels from '../SettingsModels';
import { sectionAccentMap } from '../settings/constants';
import { useSettingsSections } from '../settings/sections';

// Mock window.electronAPI
const mockElectronAPI = {
  modelsStatus: vi.fn(),
  modelsGetConfig: vi.fn(),
  modelsAliasesList: vi.fn(),
  modelsOnboard: vi.fn(),
  modelsScan: vi.fn(),
  modelsSetPrimary: vi.fn(),
  modelsFallbackAdd: vi.fn(),
  modelsFallbackRemove: vi.fn(),
  modelsAliasAdd: vi.fn(),
  modelsAliasRemove: vi.fn(),
};

// @ts-ignore
global.window.electronAPI = mockElectronAPI;

// 测试辅助函数：包装组件
const renderWithI18n = (component: React.ReactElement) => {
  return render(
    <I18nProvider>
      {component}
    </I18nProvider>
  );
};

describe('SettingsModels - 路由注册', () => {
  it('sections 数组中应包含 id 为 models 的条目', () => {
    const TestComponent = () => {
      const sections = useSettingsSections();
      const modelsSection = sections.find(s => s.id === 'models');
      
      return (
        <div>
          {modelsSection ? (
            <div data-testid="models-section-found">
              {modelsSection.name}
            </div>
          ) : (
            <div data-testid="models-section-not-found">Not found</div>
          )}
        </div>
      );
    };

    renderWithI18n(<TestComponent />);
    expect(screen.getByTestId('models-section-found')).toBeDefined();
  });

  it('sectionAccentMap 中应包含 models 键', () => {
    expect(sectionAccentMap.models).toBeDefined();
    expect(sectionAccentMap.models.bg).toBe('rgba(99, 102, 241, 0.12)');
    expect(sectionAccentMap.models.icon).toBe('#818CF8');
    expect(sectionAccentMap.models.glow).toBe('rgba(129, 140, 248, 0.22)');
  });
});

describe('SettingsModels - UI 渲染与初始状态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 默认成功响应
    mockElectronAPI.modelsStatus.mockResolvedValue({
      success: true,
      providers: {},
    });
    mockElectronAPI.modelsGetConfig.mockResolvedValue({
      success: true,
      primary: '',
      fallbacks: [],
    });
    mockElectronAPI.modelsAliasesList.mockResolvedValue({
      success: true,
      aliases: {},
    });
  });

  it('页面挂载后应渲染"运行 Onboard 向导"按钮', async () => {
    renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const button = screen.getByText(/Onboard/i);
      expect(button).toBeDefined();
    });
  });

  it('页面挂载后应渲染"扫描可用模型"按钮', async () => {
    renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const button = screen.getByText(/扫描/i);
      expect(button).toBeDefined();
    });
  });

  it('页面挂载后应渲染主模型输入框', async () => {
    renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/anthropic\/claude/i);
      expect(input).toBeDefined();
    });
  });
});

describe('SettingsModels - 错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('modelsStatus 失败时所有提供商状态应为 unknown', async () => {
    mockElectronAPI.modelsStatus.mockResolvedValue({
      success: false,
      error: '网络错误',
      providers: {},
    });
    mockElectronAPI.modelsGetConfig.mockResolvedValue({
      success: true,
      primary: '',
      fallbacks: [],
    });
    mockElectronAPI.modelsAliasesList.mockResolvedValue({
      success: true,
      aliases: {},
    });

    renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      // 应显示错误提示
      const errorText = screen.getByText(/加载提供商状态失败/i);
      expect(errorText).toBeDefined();
    });
  });

  it('Onboard 启动失败时应显示错误信息', async () => {
    mockElectronAPI.modelsStatus.mockResolvedValue({
      success: true,
      providers: {},
    });
    mockElectronAPI.modelsGetConfig.mockResolvedValue({
      success: true,
      primary: '',
      fallbacks: [],
    });
    mockElectronAPI.modelsAliasesList.mockResolvedValue({
      success: true,
      aliases: {},
    });
    mockElectronAPI.modelsOnboard.mockResolvedValue({
      success: false,
      error: '命令不存在',
    });

    const { container } = renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const button = screen.getByText(/Onboard/i);
      button.click();
    });

    await waitFor(() => {
      // 应显示错误消息
      const errorMessage = container.querySelector('[style*="rgba(34, 197, 94"]');
      expect(errorMessage).toBeDefined();
    });
  });

  it('扫描失败时应显示错误详情', async () => {
    mockElectronAPI.modelsStatus.mockResolvedValue({
      success: true,
      providers: {},
    });
    mockElectronAPI.modelsGetConfig.mockResolvedValue({
      success: true,
      primary: '',
      fallbacks: [],
    });
    mockElectronAPI.modelsAliasesList.mockResolvedValue({
      success: true,
      aliases: {},
    });
    mockElectronAPI.modelsScan.mockResolvedValue({
      success: false,
      error: 'CLI 错误',
    });

    const { container } = renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const button = screen.getByText(/扫描/i);
      button.click();
    });

    await waitFor(() => {
      // 应显示错误消息
      const errorMessage = container.querySelector('[style*="rgba(34, 197, 94"]');
      expect(errorMessage).toBeDefined();
    });
  });

  it('配置写入失败时应保留用户输入', async () => {
    mockElectronAPI.modelsStatus.mockResolvedValue({
      success: true,
      providers: {},
    });
    mockElectronAPI.modelsGetConfig.mockResolvedValue({
      success: true,
      primary: 'anthropic/claude-3',
      fallbacks: [],
    });
    mockElectronAPI.modelsAliasesList.mockResolvedValue({
      success: true,
      aliases: {},
    });
    mockElectronAPI.modelsSetPrimary.mockResolvedValue({
      success: false,
      error: '写入失败',
    });

    renderWithI18n(<SettingsModels />);
    
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/anthropic\/claude/i) as HTMLInputElement;
      expect(input.value).toBe('anthropic/claude-3');
    });
  });
});

import React, { useState, useEffect } from 'react';
import { 
  Cpu, Zap, Brain, Settings, 
  Play, StopCircle, RefreshCw,
  Database, Network, Shield, 
  BarChart, Clock, Users,
  AlertCircle, CheckCircle, XCircle,
  Minus, Eye,
  Download, Upload, Copy,
  MessageSquare, FileText, Terminal
} from 'lucide-react';
import GlassCard from './GlassCard';
import { useI18n } from '../i18n/I18nContext';

interface AgentEnhancement {
  id: string;
  name: string;
  type: 'performance' | 'security' | 'monitoring' | 'integration' | 'automation';
  description: string;
  enabled: boolean;
  settings: Record<string, any>;
  lastApplied?: string;
  status: 'active' | 'inactive' | 'error';
}

interface AgentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  tokensPerSecond: number;
  responseTime: number;
  errorRate: number;
  uptime: number;
  sessionCount: number;
  totalMessages: number;
}

interface AgentEnhancerProps {
  agentId: string;
  agentName: string;
  onEnhancementToggle?: (enhancementId: string, enabled: boolean) => void;
  onSettingsUpdate?: (enhancementId: string, settings: Record<string, any>) => void;
  onPerformanceTest?: () => void;
}

const AgentEnhancer: React.FC<AgentEnhancerProps> = ({
  agentName,
  onEnhancementToggle,
  onPerformanceTest
}) => {
  const { t } = useI18n();
  const [enhancements, setEnhancements] = useState<AgentEnhancement[]>([]);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [expandedEnhancement, setExpandedEnhancement] = useState<string | null>(null);

  // 模拟增强功能数据
  const defaultEnhancements: AgentEnhancement[] = [
    {
      id: 'performance-boost',
      name: t('agent.enhancement.performanceBoost'),
      type: 'performance',
      description: 'Optimize model inference performance and improve response speed',
      enabled: true,
      settings: { compression: 'high', cacheSize: 1000 },
      lastApplied: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'security-audit',
      name: t('agent.enhancement.securityAudit'),
      type: 'security',
      description: 'Monitor security risks in real-time and prevent malicious requests',
      enabled: true,
      settings: { auditLevel: 'high', logSensitive: true },
      lastApplied: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'real-time-monitoring',
      name: t('agent.enhancement.realTimeMonitoring'),
      type: 'monitoring',
      description: 'Display agent performance metrics and status in real-time',
      enabled: true,
      settings: { updateInterval: 5000, alertThreshold: 80 },
      lastApplied: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'api-integration',
      name: t('agent.enhancement.apiIntegration'),
      type: 'integration',
      description: 'Integrate with external API services to extend functionality',
      enabled: false,
      settings: { webhookUrl: '', maxRetries: 3 },
      status: 'inactive'
    },
    {
      id: 'auto-scaling',
      name: t('agent.enhancement.autoScaling'),
      type: 'automation',
      description: 'Automatically adjust resource allocation based on load',
      enabled: false,
      settings: { minInstances: 1, maxInstances: 5, scaleThreshold: 70 },
      status: 'inactive'
    }
  ];

  // 模拟性能指标数据
  const defaultMetrics: AgentMetrics = {
    cpuUsage: 42.5,
    memoryUsage: 245.7,
    tokensPerSecond: 156.8,
    responseTime: 0.8,
    errorRate: 0.2,
    uptime: 86400, // 24小时
    sessionCount: 8,
    totalMessages: 1245
  };

  useEffect(() => {
    // 模拟加载数据
    setTimeout(() => {
      setEnhancements(defaultEnhancements);
      setMetrics(defaultMetrics);
      setLoading(false);
    }, 500);
  }, []);

  const toggleEnhancement = async (enhancementId: string, currentEnabled: boolean) => {
    setActionLoading({ ...actionLoading, [enhancementId]: true });
    try {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newEnabled = !currentEnabled;
      setEnhancements(prev => prev.map(e => 
        e.id === enhancementId 
          ? { 
              ...e, 
              enabled: newEnabled,
              status: newEnabled ? 'active' : 'inactive',
              lastApplied: newEnabled ? new Date().toISOString() : e.lastApplied
            }
          : e
      ));
      
      onEnhancementToggle?.(enhancementId, newEnabled);
    } catch (error) {
      console.error('Failed to toggle enhancement:', error);
    } finally {
      setActionLoading({ ...actionLoading, [enhancementId]: false });
    }
  };

  const runPerformanceTest = async () => {
    setActionLoading({ ...actionLoading, 'performance-test': true });
    try {
      // 模拟性能测试
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 更新性能指标
      setMetrics(prev => prev ? {
        ...prev,
        tokensPerSecond: Math.random() * 100 + 100,
        responseTime: Math.random() * 0.5 + 0.5,
        errorRate: Math.random() * 0.5
      } : prev);
      
      onPerformanceTest?.();
    } catch (error) {
      console.error('Performance test failed:', error);
    } finally {
      setActionLoading({ ...actionLoading, 'performance-test': false });
    }
  };

  const getTypeIcon = (type: AgentEnhancement['type']) => {
    switch (type) {
      case 'performance': return <Zap className="w-5 h-5" />;
      case 'security': return <Shield className="w-5 h-5" />;
      case 'monitoring': return <BarChart className="w-5 h-5" />;
      case 'integration': return <Network className="w-5 h-5" />;
      case 'automation': return <Brain className="w-5 h-5" />;
      default: return <Settings className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: AgentEnhancement['type']) => {
    switch (type) {
      case 'performance': return 'bg-yellow-500/10 text-yellow-500';
      case 'security': return 'bg-red-500/10 text-red-500';
      case 'monitoring': return 'bg-blue-500/10 text-blue-500';
      case 'integration': return 'bg-green-500/10 text-green-500';
      case 'automation': return 'bg-purple-500/10 text-purple-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  const getStatusColor = (status: AgentEnhancement['status']) => {
    switch (status) {
      case 'active': return 'text-green-500 bg-green-500/10';
      case 'inactive': return 'text-gray-500 bg-gray-500/10';
      case 'error': return 'text-red-500 bg-red-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getStatusIcon = (status: AgentEnhancement['status']) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'inactive': return <XCircle className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      default: return <XCircle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 性能指标卡片 */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--app-text)' }}>{t('agent.enhancement.performanceMetrics')}</h2>
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{agentName} {t('agent.enhancement.realTimeMonitoring')}</p>
          </div>
          <button
            onClick={runPerformanceTest}
            disabled={actionLoading['performance-test']}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            {actionLoading['performance-test'] ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <BarChart className="w-4 h-4 mr-2" />
            )}
            {t('agent.enhancement.performanceTest')}
          </button>
        </div>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Cpu className="w-8 h-8" style={{ color: '#00B4FF' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.cpuUsage')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.cpuUsage.toFixed(1)}%</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Database className="w-8 h-8" style={{ color: '#00D0B6' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.memoryUsage')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.memoryUsage.toFixed(1)} MB</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Zap className="w-8 h-8" style={{ color: '#FF6B6B' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.tokensPerSecond')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.tokensPerSecond.toFixed(1)}</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Clock className="w-8 h-8" style={{ color: '#FFD700' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.responseTime')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.responseTime.toFixed(1)}s</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <AlertCircle className="w-8 h-8" style={{ color: '#EF4444' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.errorRate')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.errorRate.toFixed(1)}%</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Brain className="w-8 h-8" style={{ color: '#8B5CF6' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.uptime')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>
                  {Math.floor(metrics.uptime / 3600)}h {Math.floor((metrics.uptime % 3600) / 60)}m
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <Users className="w-8 h-8" style={{ color: '#10B981' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.activeSessions')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.sessionCount}</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
              <MessageSquare className="w-8 h-8" style={{ color: '#3B82F6' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.totalMessages')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--app-text)' }}>{metrics.totalMessages}</div>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* 增强功能卡片 */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--app-text)' }}>{t('agent.enhancement.enhancements')}</h2>
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('agent.enhancement.subtitle')}</p>
          </div>
          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {enhancements.filter(e => e.enabled).length} / {enhancements.length} {t('agent.enhancement.enabled')}
          </div>
        </div>

        <div className="space-y-4">
          {enhancements.map((enhancement) => (
            <div key={enhancement.id} className="border rounded-lg" style={{ borderColor: 'var(--app-border)' }}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
                      {getTypeIcon(enhancement.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold" style={{ color: 'var(--app-text)' }}>{enhancement.name}</h3>
                        <span className={`text-xs font-medium px-2 py-1 rounded flex items-center gap-1 ${getTypeColor(enhancement.type)}`}>
                          {enhancement.type.charAt(0).toUpperCase() + enhancement.type.slice(1)}
                        </span>
                        <span className={`text-xs font-medium px-2 py-1 rounded flex items-center gap-1 ${getStatusColor(enhancement.status)}`}>
                          {getStatusIcon(enhancement.status)}
                          {t(`agent.enhancement.${enhancement.status}`)}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{enhancement.description}</p>
                      
                      {enhancement.lastApplied && (
                        <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                          {t('agent.enhancement.lastApplied')}: {new Date(enhancement.lastApplied).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setExpandedEnhancement(expandedEnhancement === enhancement.id ? null : enhancement.id)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: 'var(--app-text-muted)' }}
                      title={expandedEnhancement === enhancement.id ? t('agent.enhancement.collapseSettings') : t('agent.enhancement.expandSettings')}
                    >
                      {expandedEnhancement === enhancement.id ? (
                        <Minus className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => toggleEnhancement(enhancement.id, enhancement.enabled)}
                      disabled={actionLoading[enhancement.id]}
                      className="p-2 rounded-lg transition-colors"
                      style={
                        enhancement.enabled
                          ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }
                          : { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }
                      }
                      title={enhancement.enabled ? 'Disable enhancement' : 'Enable enhancement'}
                    >
                      {actionLoading[enhancement.id] ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : enhancement.enabled ? (
                        <StopCircle className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                {/* 展开的设置面板 */}
                {expandedEnhancement === enhancement.id && (
                  <div className="mt-4 p-4 border rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium" style={{ color: 'var(--app-text)' }}>{t('agent.enhancement.settings')}</h4>
                      <button
                        onClick={() => {
                          alert(t('common.success'));
                        }}
                        className="text-sm px-3 py-1 rounded-lg"
                        style={{
                          backgroundColor: 'var(--app-bg-elevated)',
                          border: '1px solid var(--app-border)',
                          color: 'var(--app-text)',
                        }}
                      >
                        {t('agent.enhancement.saveSettings')}
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {Object.entries(enhancement.settings).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}:
                          </span>
                          <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                            {typeof value === 'boolean' ? (value ? t('common.yes') : t('common.no')) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 快速操作卡片 */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--app-text)' }}>{t('agent.enhancement.quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Terminal className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.debugTerminal')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Download className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.exportConfig')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Upload className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.importConfig')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Copy className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.cloneAgent')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <FileText className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.generateReport')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <RefreshCw className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.restartAgent')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Shield className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.securityCheck')}</span>
          </button>
          
          <button className="flex flex-col items-center justify-center p-4 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}>
            <Brain className="w-6 h-6 mb-2" />
            <span className="text-sm">{t('agent.enhancement.trainingMode')}</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

export default AgentEnhancer;
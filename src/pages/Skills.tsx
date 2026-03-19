import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Code, Package, Search, 
  RefreshCw, Download, Upload, Trash2,
  AlertCircle, CheckCircle,
  Star, ExternalLink,
  Filter, SortAsc, SortDesc,
  Play, StopCircle
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import GlobalLoading from '../components/GlobalLoading';
import { useI18n } from '../i18n/I18nContext';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: 'installed' | 'available' | 'updatable' | 'error';
  installedAt?: string;
  updatedAt?: string;
  size?: number;
  dependencies?: string[];
  rating?: number;
  downloads?: number;
  enabled: boolean;
  path?: string;
}

const Skills: React.FC = () => {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'rating' | 'downloads'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.skillsGetAll();
      if (result.success && result.skills) {
        setSkills(result.skills);
      } else {
        setError(result.error || t('skills.loadFailed'));
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
      setError(t('skills.connectionFailed'));
    } finally {
      setLoading(false);
    }
  };

  const installSkill = async (skillId: string) => {
    setActionLoading({ ...actionLoading, [skillId]: true });
    try {
      const result = await window.electronAPI.skillsInstall(skillId);
      if (result.success) {
        await loadSkills();
      } else {
        alert(result.error || t('skills.installFailed'));
      }
    } catch (error) {
      console.error('Failed to install skill:', error);
      alert(t('skills.installFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [skillId]: false });
    }
  };

  const uninstallSkill = async (skillId: string) => {
    if (!confirm(t('skills.confirmUninstall'))) return;
    
    setActionLoading({ ...actionLoading, [skillId]: true });
    try {
      const result = await window.electronAPI.skillsUninstall(skillId);
      if (result.success) {
        await loadSkills();
      } else {
        alert(result.error || t('skills.uninstallFailed'));
      }
    } catch (error) {
      console.error('Failed to uninstall skill:', error);
      alert(t('skills.uninstallFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [skillId]: false });
    }
  };

  const updateSkill = async (skillId: string) => {
    setActionLoading({ ...actionLoading, [skillId]: true });
    try {
      const result = await window.electronAPI.skillsUpdate(skillId);
      if (result.success) {
        await loadSkills();
      } else {
        alert(result.error || t('skills.updateFailed'));
      }
    } catch (error) {
      console.error('Failed to update skill:', error);
      alert(t('skills.updateFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [skillId]: false });
    }
  };

  const toggleSkill = async (skillId: string, enabled: boolean) => {
    setActionLoading({ ...actionLoading, [skillId]: true });
    try {
      const result = enabled 
        ? await window.electronAPI.skillsEnable(skillId)
        : await window.electronAPI.skillsDisable(skillId);
      
      if (result.success) {
        await loadSkills();
      } else {
        alert(result.error || (enabled ? t('skills.enableFailed') : t('skills.disableFailed')));
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      alert(enabled ? t('skills.enableFailed') : t('skills.disableFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [skillId]: false });
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  // 获取所有分类
  const categories = ['all', ...new Set(skills.map(skill => skill.category || 'tools').filter(Boolean))];

  // 筛选和排序技能
  const filteredSkills = skills
    .filter(skill => {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower) ||
          skill.author.toLowerCase().includes(searchLower) ||
          skill.category.toLowerCase().includes(searchLower)
        );
      }
      return true;
    })
    .filter(skill => {
      if (filterCategory !== 'all') {
        return (skill.category || 'tools') === filterCategory;
      }
      return true;
    })
    .sort((a, b) => {
      let compareA: any, compareB: any;
      
      switch (sortBy) {
        case 'updatedAt':
          compareA = new Date(a.updatedAt || '').getTime();
          compareB = new Date(b.updatedAt || '').getTime();
          break;
        case 'rating':
          compareA = a.rating || 0;
          compareB = b.rating || 0;
          break;
        case 'downloads':
          compareA = a.downloads || 0;
          compareB = b.downloads || 0;
          break;
        case 'name':
        default:
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
      }
      
      if (sortOrder === 'asc') {
        return compareA > compareB ? 1 : -1;
      } else {
        return compareA < compareB ? 1 : -1;
      }
    });

  const getStatusColor = (status: SkillInfo['status']) => {
    switch (status) {
      case 'installed': return 'text-green-500 bg-green-500/10';
      case 'available': return 'text-blue-500 bg-blue-500/10';
      case 'updatable': return 'text-yellow-500 bg-yellow-500/10';
      case 'error': return 'text-red-500 bg-red-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getStatusIcon = (status: SkillInfo['status']) => {
    switch (status) {
      case 'installed': return <CheckCircle className="w-4 h-4" />;
      case 'available': return <Package className="w-4 h-4" />;
      case 'updatable': return <RefreshCw className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'ai': 'bg-purple-500/10 text-purple-500',
      'tools': 'bg-blue-500/10 text-blue-500',
      'automation': 'bg-green-500/10 text-green-500',
      'monitoring': 'bg-yellow-500/10 text-yellow-500',
      'security': 'bg-red-500/10 text-red-500',
      'development': 'bg-cyan-500/10 text-cyan-500',
      'productivity': 'bg-pink-500/10 text-pink-500',
    };
    return colors[category.toLowerCase()] || 'bg-gray-500/10 text-gray-500';
  };

  const SkillCard = ({ skill }: { skill: SkillInfo }) => (
    <GlassCard className="p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate" style={{ color: 'var(--app-text)' }}>{skill.name}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`text-xs font-medium px-2 py-1 rounded flex items-center gap-1 ${getStatusColor(skill.status)}`}>
                {getStatusIcon(skill.status)}
                {t(`skills.status.${skill.status}`)}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${getCategoryColor(skill.category || 'tools')}`}>
                {skill.category || 'tools'}
              </span>
              {skill.enabled && skill.status === 'installed' && (
                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
                  {t('skills.enabled')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {skill.rating !== undefined && (
            <div className="flex items-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
              <Star className="w-4 h-4 text-yellow-500 fill-current mr-1" />
              {skill.rating.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* Skill Description */}
      <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--app-text-muted)' }}>
        {skill.description}
      </p>

      {/* Skill Info */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
          <div className="flex-1">
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('skills.version')}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{skill.version || '1.0.0'}</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
          <div className="flex-1">
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('skills.author')}</div>
            <div className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>{skill.author || 'Unknown'}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs mb-4" style={{ color: 'var(--app-text-muted)' }}>
        {skill.downloads !== undefined && (
          <span>{`Downloads: ${skill.downloads}`}</span>
        )}
        {skill.updatedAt && (
          <span>{`Updated: ${new Date(skill.updatedAt).toLocaleDateString()}`}</span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {skill.status === 'available' && (
          <button
            onClick={() => installSkill(skill.id)}
            disabled={actionLoading[skill.id]}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            {actionLoading[skill.id] ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('skills.install')}
              </>
            )}
          </button>
        )}
        
        {skill.status === 'updatable' && (
          <button
            onClick={() => updateSkill(skill.id)}
            disabled={actionLoading[skill.id]}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            {actionLoading[skill.id] ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('skills.update')}
              </>
            )}
          </button>
        )}
        
        {skill.status === 'installed' && (
          <>
            {skill.enabled ? (
              <button
                onClick={() => toggleSkill(skill.id, false)}
                disabled={actionLoading[skill.id]}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                {actionLoading[skill.id] ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <StopCircle className="w-4 h-4 mr-2" />
                    {t('skills.disable')}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => toggleSkill(skill.id, true)}
                disabled={actionLoading[skill.id]}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                {actionLoading[skill.id] ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    {t('skills.enable')}
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={() => uninstallSkill(skill.id)}
              disabled={actionLoading[skill.id]}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#EF4444',
              }}
            >
              {actionLoading[skill.id] ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </>
        )}
        
        {skill.path && skill.status === 'installed' && (
          <button
            onClick={() => window.electronAPI.openPath?.(skill.path!)}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              color: 'var(--app-text-muted)',
            }}
            title={t('skills.openDirectory')}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
    </GlassCard>
  );

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto">
        {/* 顶部渐变标题卡片 */}
        <GlassCard
          variant="gradient"
          className="relative rounded-[28px] px-6 py-5 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(139, 92, 246, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
            backdropFilter: 'blur(18px)',
            border: 'none',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(168, 85, 247, 0.18)' }} />
          <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(139, 92, 246, 0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--app-text)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
              >
                <BookOpen size={14} />
                技能市场
              </div>
              <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                {t('skills.title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                {t('skills.subtitle')}
              </p>
            </div>

            <div className="flex items-center space-x-3 shrink-0">
              <button
                onClick={loadSkills}
                disabled={loading}
                className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-105 active:scale-95"
                style={{ 
                  backgroundColor: 'var(--app-bg-elevated)', 
                  border: '1px solid var(--app-border)', 
                  color: 'var(--app-text)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--app-hover)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--app-bg-elevated)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                }}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? t('common.loading') : t('common.refresh')}
              </button>
              <button
                onClick={() => alert('上传技能功能即将推出')}
                className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00B4FF 0%, #22C55E 100%)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(0, 180, 255, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 180, 255, 0.4)';
                  e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 180, 255, 0.3)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                {t('skills.upload')}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Search and Filter Bar */}
        <GlassCard className="p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--app-text-muted)' }} />
                <input
                  type="text"
                  placeholder={t('skills.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5" style={{ color: 'var(--app-text-muted)' }} />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                <option value="all">{t('skills.allCategories')}</option>
                {categories.filter(c => c !== 'all').map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  if (sortBy === 'name') {
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortBy('name');
                    setSortOrder('asc');
                  }
                }}
                className="px-3 py-2 rounded-lg text-sm flex items-center space-x-2"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                <span>{t('skills.sortByName')}</span>
                {sortBy === 'name' && (
                  sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                )}
              </button>
              
              <button
                onClick={() => {
                  if (sortBy === 'updatedAt') {
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortBy('updatedAt');
                    setSortOrder('desc');
                  }
                }}
                className="px-3 py-2 rounded-lg text-sm flex items-center space-x-2"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                <span>{t('skills.sortByUpdated')}</span>
                {sortBy === 'updatedAt' && (
                  sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>{t('skills.total')}</p>
                <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>{skills.length}</p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <BookOpen className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>{t('skills.installed')}</p>
                <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>
                  {skills.filter(s => s.status === 'installed' || s.status === 'updatable').length}
                </p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>{t('skills.updatable')}</p>
                <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>
                  {skills.filter(s => s.status === 'updatable').length}
                </p>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <RefreshCw className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>{t('skills.enabled')}</p>
                <p className="text-3xl font-bold mt-2" style={{ color: 'var(--app-text)' }}>
                  {skills.filter(s => s.enabled && (s.status === 'installed' || s.status === 'updatable')).length}
                </p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Play className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)' }}>
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-500">{error}</span>
            </div>
          </div>
        )}

        {/* Skills Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <GlobalLoading visible text="加载技能中" overlay={false} size="md" />
          </div>
        ) : filteredSkills.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <BookOpen className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--app-text)' }}>{t('skills.noSkills')}</h3>
            <p className="mb-6" style={{ color: 'var(--app-text-muted)' }}>
              {searchTerm || filterCategory !== 'all' 
                ? t('skills.noSkillsFiltered')
                : t('skills.noSkillsDescription')}
            </p>
            {(searchTerm || filterCategory !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('all');
                }}
                className="inline-flex items-center px-4 py-2 bg-tech-cyan hover:bg-tech-green text-white rounded-lg text-sm font-medium transition-colors mb-4"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('skills.clearFilters')}
              </button>
            )}
          </GlassCard>
        )}

        {/* Info Footer */}
        <div className="mt-8 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
          <p>
            {t('skills.footerInfo')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Skills;
import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, FileJson } from 'lucide-react';
import GlassCard from '../components/GlassCard';

const Config: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<any>({});

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.configGet();
      if (result.success) {
        const initialEditing: any = {};
        Object.keys(result.config || {}).forEach(key => {
          initialEditing[key] = {
            value: result.config[key],
            type: typeof result.config[key],
            isEditable: true
          };
        });
        setEditing(initialEditing);
        setMessage('');
      } else {
        setEditing({});
        setMessage(`error:${result.error}`);
      }
    } catch (error: any) {
      setEditing({});
      setMessage(`error:${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    
    const newConfig: any = {};
    Object.keys(editing).forEach(key => {
      if (editing[key].type === 'number' && !isNaN(parseFloat(editing[key].value))) {
        newConfig[key] = parseFloat(editing[key].value);
      } else if (editing[key].type === 'boolean') {
        newConfig[key] = editing[key].value === 'true';
      } else {
        newConfig[key] = editing[key].value;
      }
    });
    
    const result = await window.electronAPI.configSet(newConfig);
    setLoading(false);
    
    if (result.success) {
      setMessage('success:配置保存成功！');
    } else {
      setMessage('error:' + result.error);
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleFieldChange = (key: string, value: string) => {
    setEditing({
      ...editing,
      [key]: {
        ...editing[key],
        value: value
      }
    });
  };

  const handleAddField = () => {
    const newKey = prompt('请输入字段名称：');
    if (newKey && newKey.trim()) {
      const trimmedKey = newKey.trim();
      setEditing({
        ...editing,
        [trimmedKey]: {
          value: '',
          type: 'string',
          isEditable: true
        }
      });
    }
  };

  const handleDeleteField = (key: string) => {
    if (confirm('确定要删除 "' + key + '" 吗？')) {
      const newEditing = { ...editing };
      delete newEditing[key];
      setEditing(newEditing);
    }
  };

  if (loading) {
    return (
      /* 加载状态：使用 page-content 统一内边距 */
      <div className="page-content flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <Settings size={24} className="animate-pulse" style={{ color: 'var(--app-text-muted)' }} />
          </div>
          <p style={{ color: 'var(--app-text-muted)' }}>加载配置中...</p>
        </div>
      </div>
    );
  }

  const editableFields = Object.keys(editing).filter(key => editing[key].isEditable);
  
  return (
    /* 页面内容区域：使用 page-content 统一内边距 --space-6 */
    <div className="page-content pb-28 min-h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 bg-gradient-to-b from-tech-cyan to-tech-green rounded-full" />
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>配置管理</h1>
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>管理您的 OpenClaw 设置</p>
          </div>
        </div>
        
        <button
          onClick={handleAddField}
          className="btn-secondary flex items-center gap-2"
        >
          <Plus size={16} />
          添加字段
        </button>
      </div>

      <div className="space-y-6">
        {editableFields.map((key) => (
          <GlassCard key={key} variant="default">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{key}</label>
                <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--app-text-muted)', backgroundColor: 'var(--app-bg-subtle)' }}>
                  {editing[key].type}
                </span>
              </div>
              <button
                onClick={() => handleDeleteField(key)}
                className="p-1.5 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            
            {editing[key].type === 'boolean' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleFieldChange(key, 'true')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={editing[key].value === 'true'
                    ? {
                        backgroundColor: 'var(--app-segment-active-bg)',
                        color: '#00B4FF',
                        border: '1px solid rgba(0, 180, 255, 0.3)',
                      }
                    : {
                        backgroundColor: 'var(--app-bg-subtle)',
                        color: 'var(--app-text-muted)',
                        border: '1px solid var(--app-border)',
                      }}
                >
                  是
                </button>
                <button
                  onClick={() => handleFieldChange(key, 'false')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={editing[key].value === 'false'
                    ? {
                        backgroundColor: 'var(--app-segment-active-bg)',
                        color: '#00B4FF',
                        border: '1px solid rgba(0, 180, 255, 0.3)',
                      }
                    : {
                        backgroundColor: 'var(--app-bg-subtle)',
                        color: 'var(--app-text-muted)',
                        border: '1px solid var(--app-border)',
                      }}
                >
                  否
                </button>
              </div>
            ) : editing[key].type === 'number' ? (
              <input
                type="number"
                value={editing[key].value}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="input-modern"
              />
            ) : (
              <textarea
                value={editing[key].value}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="input-modern font-mono text-sm"
                rows={3}
              />
            )}
          </GlassCard>
        ))}
        
        {editableFields.length === 0 && (
          <GlassCard variant="default">
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
                <FileJson size={24} style={{ color: 'var(--app-text-muted)' }} />
              </div>
              <p className="mb-2" style={{ color: 'var(--app-text-muted)' }}>暂无配置字段</p>
              <button onClick={handleAddField} className="btn-secondary inline-flex items-center gap-2">
                <Plus size={16} />
                添加第一个字段
              </button>
            </div>
          </GlassCard>
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 p-4"
        style={{
          background: 'linear-gradient(to top, var(--app-bg), var(--app-bg), transparent)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-base"
          >
            {loading ? '保存中...' : '保存配置'}
          </button>
          
          {message && (
            <p className={`mt-3 text-center text-sm ${
              message.startsWith('success') ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {message.replace(/^(success|error):/, '')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Config;
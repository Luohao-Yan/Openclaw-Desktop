import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Folder,
  Info,
  Link2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  AgentGlobalConfigOverview,
  AgentManagedFileDetail,
  AgentSkillInfo,
  AgentWorkspaceBrowseResult,
  AgentWorkspaceDetails,
  AgentWorkspaceEntry,
  AgentWorkspaceFileDetail,
  AgentWorkspaceFileName,
  AgentMemoryFileDetail,
  AgentWorkspaceFileSummary,
  AgentWorkspaceTrashEntry,
  SkillInfo,
} from '../../types/electron';
import AppButton from '../components/AppButton';
import AppModal from '../components/AppModal';
import AppBadge from '../components/AppBadge';
import AppSelect, { type AppSelectOption } from '../components/AppSelect';
import JsonFormEditor, { type JsonFormSchema, type JsonFormTabItem } from '../components/JsonFormEditor';
import AppTable from '../components/AppTable';
import GlassCard from '../components/GlassCard';
import AgentSkillsPanel from '../components/agents/AgentSkillsPanel';
import { useI18n } from '../i18n/I18nContext';

const CORE_FILES: AgentWorkspaceFileName[] = [
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
];

const formatTimestamp = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
};

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type SessionEventRecord = {
  id?: string;
  type?: string;
  timestamp?: string;
  role?: string;
  parentId?: string | null;
  summary: string;
  detail: string;
  raw: Record<string, any>;
};

// 绑定编辑器状态：mode 区分新增和编辑模式
type GlobalBindingEditorState = {
  mode: 'add' | 'edit';       // 操作模式：add 新增，edit 编辑
  index: number;               // edit 模式下的绑定索引，add 模式下为 -1
  channel?: string;
  accountId?: string;
  binding: any;
  accountConfig?: any;
};

type AgentModelOption = {
  description?: string;
  label: string;
  value: string;
};

type GlobalModelEditorState = {
  fallbacks: string[];
  primary: string;
};

const isJsonLikeFile = (fileName: string) => fileName.endsWith('.json');
const isSessionLogFile = (fileName: string) => fileName.includes('.jsonl');

const tryParseJsonContent = (content: string) => {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return null;
  }
};

const toCanonicalJsonString = (value: any) => JSON.stringify(value ?? {}, null, 2);

const getTopLevelSections = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [] as string[];
  }

  return Object.keys(value);
};

const buildAgentModelOptions = (config: any): AgentModelOption[] => {
  const modelRegistry = config?.agents?.models || config?.agents?.defaults?.models || {};

  return Object.entries(modelRegistry || {}).map(([key, modelConfig]: [string, any]) => ({
    value: key,
    label: typeof modelConfig?.alias === 'string' && modelConfig.alias.trim() ? modelConfig.alias : key,
    description: key,
  }));
};

const matchesSearch = (label: string, search: string) => !search
  || label.toLowerCase().includes(search.toLowerCase());

const hasSearchMatch = (label: string, value: any, search: string): boolean => {
  if (!search) {
    return true;
  }

  if (matchesSearch(label, search)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item, index) => hasSearchMatch(`${label}.${index}`, item, search));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, childValue]) => hasSearchMatch(`${label}.${key}`, childValue, search));
  }

  return String(value ?? '').toLowerCase().includes(search.toLowerCase());
};

const getEntryKindLabel = (entry: AgentWorkspaceEntry) => {
  if (entry.name === 'sessions.json') {
    return '会话索引';
  }

  if (entry.name.endsWith('.jsonl')) {
    return '会话日志';
  }

  if (entry.kind === 'directory') {
    return '目录';
  }

  if (entry.name.endsWith('.json')) {
    return '配置文件';
  }

  return '文件';
};

const stringifySessionValue = (value: any): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifySessionValue(item))
      .filter(Boolean)
      .join('\n\n');
  }

  if (typeof value === 'object') {
    const prioritized = [
      value.text,
      value.content,
      value.message,
      value.input,
      value.output,
      value.result,
      value.value,
      value.data,
    ].map((item) => stringifySessionValue(item)).filter(Boolean);

    if (prioritized.length) {
      return prioritized.join('\n\n');
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const extractSessionMessageDetail = (parsed: Record<string, any>) => {
  const container = parsed?.message ?? parsed;
  const parts = [
    stringifySessionValue(container?.content),
    stringifySessionValue(container?.contents),
    stringifySessionValue(container?.text),
    stringifySessionValue(container?.toolResult),
    stringifySessionValue(container?.toolUse),
    stringifySessionValue(container?.tool_use),
    stringifySessionValue(container?.tool_result),
    stringifySessionValue(container?.input),
    stringifySessionValue(container?.output),
  ].filter(Boolean);

  return parts.join('\n\n').trim();
};

const parseSessionEvents = (content: string): SessionEventRecord[] => content
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    try {
      const parsed = JSON.parse(line);
      const type = typeof parsed?.type === 'string' ? parsed.type : 'unknown';
      const role = typeof parsed?.message?.role === 'string'
        ? parsed.message.role
        : typeof parsed?.role === 'string'
          ? parsed.role
          : undefined;
      const detail = type === 'message'
        ? extractSessionMessageDetail(parsed)
        : type === 'model_change'
          ? stringifySessionValue({ provider: parsed?.provider, modelId: parsed?.modelId, modelProvider: parsed?.modelProvider })
          : type === 'thinking_level_change'
            ? stringifySessionValue({ thinkingLevel: parsed?.thinkingLevel })
            : type === 'session'
              ? stringifySessionValue({ cwd: parsed?.cwd, version: parsed?.version, timestamp: parsed?.timestamp })
              : type === 'custom'
                ? stringifySessionValue(parsed?.data || parsed)
                : stringifySessionValue(parsed);
      const summary = type === 'message'
        ? detail.replace(/\s+/g, ' ').slice(0, 140) || '消息事件'
        : type === 'model_change'
          ? `模型切换 · ${parsed?.provider || '-'} / ${parsed?.modelId || '-'}`
          : type === 'thinking_level_change'
            ? `推理等级变更 · ${parsed?.thinkingLevel || '-'}`
            : type === 'session'
              ? `会话初始化 · ${parsed?.cwd || '-'}`
              : type === 'custom'
                ? `自定义事件 · ${parsed?.customType || '-'}`
                : JSON.stringify(parsed).slice(0, 140);

      return {
        id: parsed?.id,
        type,
        timestamp: parsed?.timestamp,
        role,
        parentId: parsed?.parentId,
        summary,
        detail: detail || summary,
        raw: parsed,
      };
    } catch {
      return {
        type: 'raw',
        summary: line.slice(0, 140),
        detail: line,
        raw: { line },
      };
    }
  });

const getSessionEventTone = (event: SessionEventRecord) => {
  if (event.type === 'message') {
    return event.role === 'user'
      ? {
          bg: 'rgba(14, 165, 233, 0.12)',
          border: 'rgba(14, 165, 233, 0.20)',
          text: '#38BDF8',
          label: '用户消息',
        }
      : {
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.20)',
          text: '#34D399',
          label: '助手消息',
        };
  }

  if (event.type === 'model_change') {
    return {
      bg: 'rgba(139, 92, 246, 0.12)',
      border: 'rgba(139, 92, 246, 0.20)',
      text: '#A78BFA',
      label: '模型切换',
    };
  }

  return {
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.18)',
    text: 'var(--app-text-muted)',
    label: event.type || '事件',
  };
};

const AgentWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useI18n();
  const [details, setDetails] = useState<AgentWorkspaceDetails | null>(null);
  const [activeFile, setActiveFile] = useState<AgentWorkspaceFileName>('AGENTS.md');
  const [fileState, setFileState] = useState<Record<string, AgentWorkspaceFileDetail>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const [renamingEntry, setRenamingEntry] = useState<AgentWorkspaceEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<AgentWorkspaceEntry | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashRestoringId, setTrashRestoringId] = useState<string | null>(null);
  const [trashRoot, setTrashRoot] = useState<string | null>(null);
  const [trashEntries, setTrashEntries] = useState<AgentWorkspaceTrashEntry[]>([]);
  const [selectedTrashEntryIds, setSelectedTrashEntryIds] = useState<string[]>([]);
  const [trashBatchAction, setTrashBatchAction] = useState<'restore' | 'delete' | 'clear' | null>(null);
  const [memoryEditorOpen, setMemoryEditorOpen] = useState(false);
  const [activeMemoryPath, setActiveMemoryPath] = useState<string | null>(null);
  const [memoryFile, setMemoryFile] = useState<AgentMemoryFileDetail | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryClearing, setMemoryClearing] = useState(false);
  const [entryBrowserOpen, setEntryBrowserOpen] = useState<'workspace' | 'config' | 'sessions' | null>(null);
  const [workspaceBrowse, setWorkspaceBrowse] = useState<AgentWorkspaceBrowseResult | null>(null);
  const [skillsConfigPreviewOpen, setSkillsConfigPreviewOpen] = useState(false);
  const [skillsConfigPreview, setSkillsConfigPreview] = useState('');
  const [globalAgentConfigOpen, setGlobalAgentConfigOpen] = useState(false);
  const [globalAgentConfigDraft, setGlobalAgentConfigDraft] = useState<any | null>(null);
  const [globalAgentConfigSaving, setGlobalAgentConfigSaving] = useState(false);
  const [globalModelEditorOpen, setGlobalModelEditorOpen] = useState(false);
  const [globalModelEditor, setGlobalModelEditor] = useState<GlobalModelEditorState>({
    primary: '',
    fallbacks: [],
  });
  const [globalModelOptions, setGlobalModelOptions] = useState<AgentModelOption[]>([]);
  const [globalModelSaving, setGlobalModelSaving] = useState(false);
  const [globalBindingEditor, setGlobalBindingEditor] = useState<GlobalBindingEditorState | null>(null);
  const [globalBindingDraft, setGlobalBindingDraft] = useState<any | null>(null);
  const [globalBindingBaseline, setGlobalBindingBaseline] = useState<any | null>(null);
  const [globalBindingSaving, setGlobalBindingSaving] = useState(false);
  const [deletingBindingIndex, setDeletingBindingIndex] = useState<number | null>(null); // 待删除绑定的本地索引
  const [bindingDeleting, setBindingDeleting] = useState(false); // 删除操作进行中
  const [globalChannels, setGlobalChannels] = useState<Record<string, any>>({}); // 全局渠道配置（来自 openclaw.json channels 节点）
  const [managedFileOpen, setManagedFileOpen] = useState(false);
  const [managedFile, setManagedFile] = useState<AgentManagedFileDetail | null>(null);
  const [managedDraft, setManagedDraft] = useState('');
  const [managedSaving, setManagedSaving] = useState(false);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedJsonDraft, setManagedJsonDraft] = useState<any | null>(null);
  const [managedJsonBaseline, setManagedJsonBaseline] = useState<any | null>(null);
  const [managedViewMode, setManagedViewMode] = useState<'conversation' | 'table' | 'raw'>('raw');
  const [selectedSessionEvent, setSelectedSessionEvent] = useState<SessionEventRecord | null>(null);

  // 专属技能面板状态
  const [skillsPanelOpen, setSkillsPanelOpen] = useState(false);
  const [agentSkills, setAgentSkills] = useState<AgentSkillInfo | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([]);

  const loadWorkspace = async () => {
    if (!agentId) {
      setError('缺少 Agent ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.agentsGetWorkspaceDetails(agentId);
      if (!result.success || !result.details) {
        const errorMsg = result.error || '加载 Agent Workspace 失败';
        setError(errorMsg);
        return;
      }

      setDetails(result.details);
      try {
        const configResult = await window.electronAPI.configGet();
        if (configResult.success && configResult.config) {
          setGlobalModelOptions(buildAgentModelOptions(configResult.config));
          // 缓存全局渠道配置，供绑定编辑器下拉选项使用
          setGlobalChannels((configResult.config as any).channels || {});
        }
      } catch {
        setGlobalModelOptions([]);
        setGlobalChannels({});
      }
      const firstAvailable = result.details.files.find((item) => item.exists)?.name
        || result.details.files[0]?.name
        || CORE_FILES[0];
      setActiveFile(firstAvailable);
    } catch (loadError) {
      console.error('Failed to load agent workspace details:', loadError);
      setError(`加载 Agent Workspace 时发生异常: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
    } finally {
      setLoading(false);
    }
  };

  // 加载当前 Agent 的专属技能信息
  const loadAgentSkills = async () => {
    if (!agentId) return;
    setLoadingSkills(true);
    try {
      const result = await window.electronAPI.skillsGetAgentSkills(agentId);
      if (result.success && result.agentSkills) {
        setAgentSkills(result.agentSkills);
      }
    } catch (err) {
      console.error('加载专属技能失败:', err);
    } finally {
      setLoadingSkills(false);
    }
  };

  // 加载所有可用技能列表
  const loadAllSkills = async () => {
    try {
      const result = await window.electronAPI.skillsGetAll();
      if (result.success && result.skills) {
        setAllSkills(result.skills);
      }
    } catch (err) {
      console.error('加载技能列表失败:', err);
    }
  };

  const openGlobalModelEditor = async () => {
    if (!agentId) {
      return;
    }

    setError(null);
    setSaveMessage(null);

    try {
      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(configResult.error || '读取全局配置失败');
        return;
      }

      const options = buildAgentModelOptions(configResult.config);

      const currentAgent = (configResult.config?.agents?.list || []).find((item: any) => item?.id === agentId);
      const currentModel = currentAgent?.model;
      const primary = typeof currentModel === 'string'
        ? currentModel
        : typeof currentModel?.primary === 'string'
          ? currentModel.primary
          : '';
      const fallbacks = Array.isArray(currentModel?.fallbacks)
        ? currentModel.fallbacks.filter((item: unknown): item is string => typeof item === 'string')
        : [];

      setGlobalModelOptions(options);
      setGlobalModelEditor({
        primary,
        fallbacks,
      });
      setGlobalModelEditorOpen(true);
    } catch (modelError) {
      setError(`读取模型配置时发生异常: ${modelError instanceof Error ? modelError.message : String(modelError)}`);
    }
  };

  const closeGlobalModelEditor = () => {
    if (globalModelSaving) {
      return;
    }

    setGlobalModelEditorOpen(false);
  };

  const handleSaveGlobalModelConfig = async () => {
    if (!agentId) {
      return;
    }

    if (!globalModelEditor.primary) {
      setError('请选择当前模型');
      return;
    }

    setGlobalModelSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(configResult.error || '读取全局配置失败');
        return;
      }

      const currentList = Array.isArray(configResult.config?.agents?.list)
        ? configResult.config.agents.list
        : [];
      const nextList = currentList.map((item: any) => {
        if (item?.id !== agentId) {
          return item;
        }

        const nextFallbacks = globalModelEditor.fallbacks.filter((value) => value && value !== globalModelEditor.primary);

        return {
          ...item,
          model: {
            ...(item?.model && typeof item.model === 'object' && !Array.isArray(item.model) ? item.model : {}),
            primary: globalModelEditor.primary,
            fallbacks: nextFallbacks,
          },
        };
      });

      const saveResult = await window.electronAPI.configSet({
        ...configResult.config,
        agents: {
          ...configResult.config.agents,
          list: nextList,
        },
      });
      if (!saveResult.success) {
        setError(saveResult.error || '保存模型配置失败');
        return;
      }

      setSaveMessage('模型配置已保存，重启 Gateway 后会按新配置重新生成派生文件');
      setGlobalModelEditorOpen(false);
      await loadWorkspace();
    } catch (modelError) {
      setError(`保存模型配置时发生异常: ${modelError instanceof Error ? modelError.message : String(modelError)}`);
    } finally {
      setGlobalModelSaving(false);
    }
  };

  const browseWorkspacePath = async (targetPath?: string) => {
    if (!agentId) {
      return;
    }

    setManagedLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.agentsListWorkspaceEntries(agentId, targetPath);
      if (!result.success || !result.result) {
        setError(result.error || '浏览 Workspace 目录失败');
        return;
      }

      setWorkspaceBrowse(result.result);
      setEntryBrowserOpen('workspace');
    } catch (workspaceError) {
      setError(`浏览 Workspace 目录时发生异常: ${workspaceError instanceof Error ? workspaceError.message : String(workspaceError)}`);
    } finally {
      setManagedLoading(false);
    }
  };

  const openWorkspaceEntry = async (entry: AgentWorkspaceEntry) => {
    if (entry.kind === 'directory') {
      await browseWorkspacePath(entry.path);
      return;
    }

    await openManagedFile(entry.path);
  };

  const closeEntryBrowser = () => {
    setEntryBrowserOpen(null);
    setWorkspaceBrowse(null);
  };

  const openManagedFile = async (targetPath: string) => {
    if (!agentId) {
      return;
    }

    setManagedLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsReadManagedFile(agentId, targetPath);
      if (!result.success || !result.file) {
        setError(result.error || '读取文件失败');
        return;
      }

      const parsedJson = isJsonLikeFile(result.file.name)
        ? tryParseJsonContent(result.file.content || '')
        : null;

      setManagedFile(result.file);
      setManagedDraft(result.file.content || '');
      setManagedJsonDraft(parsedJson);
      setManagedJsonBaseline(parsedJson);
      setManagedViewMode(isSessionLogFile(result.file.name) ? 'conversation' : 'raw');
      setManagedFileOpen(true);
    } catch (managedError) {
      setError(`读取配置文件时发生异常: ${managedError instanceof Error ? managedError.message : String(managedError)}`);
    } finally {
      setManagedLoading(false);
    }
  };

  const closeManagedFile = () => {
    if (isManagedDirty) {
      const shouldClose = window.confirm('你有未保存的修改，确认关闭吗？');
      if (!shouldClose) {
        return;
      }
    }

    setManagedFileOpen(false);
    setManagedViewMode('raw');
    setSelectedSessionEvent(null);
  };

  const handleSaveManagedFile = async () => {
    if (!agentId || !managedFile) {
      return;
    }

    setManagedSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsSaveManagedFile(agentId, managedFile.path, managedSerializedContent);
      if (!result.success || !result.file) {
        setError(result.error || '保存文件失败');
        return;
      }

      setManagedFile(result.file);
      setManagedDraft(result.file.content || '');
      const parsedJson = isJsonLikeFile(result.file.name)
        ? tryParseJsonContent(result.file.content || '')
        : null;
      setManagedJsonDraft(parsedJson);
      setManagedJsonBaseline(parsedJson);
      setManagedViewMode(isSessionLogFile(result.file.name) ? 'conversation' : 'raw');
      setSaveMessage(`${result.file.name} 已保存`);
      await loadWorkspace();
    } catch (managedError) {
      setError(`保存文件时发生异常: ${managedError instanceof Error ? managedError.message : String(managedError)}`);
    } finally {
      setManagedSaving(false);
    }
  };

  const openGlobalAgentConfigEditor = () => {
    const rawConfig = details?.globalAgentConfig?.raw;
    setError(null);
    setSaveMessage(null);
    setGlobalAgentConfigDraft(rawConfig || {});
    setGlobalAgentConfigOpen(true);
  };

  const handleSaveGlobalAgentConfig = async () => {
    if (!agentId) {
      return;
    }

    setGlobalAgentConfigSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const parsed = globalAgentConfigDraft || {};
      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(configResult.error || '读取全局配置失败');
        return;
      }

      const currentList = Array.isArray(configResult.config?.agents?.list)
        ? configResult.config.agents.list
        : [];
      const nextList = currentList.map((item: any) => item?.id === agentId
        ? {
            ...item,
            ...parsed,
            id: item?.id || agentId,
          }
        : item);

      const saveResult = await window.electronAPI.configSet({
        ...configResult.config,
        agents: {
          ...(configResult.config?.agents || {}),
          list: nextList,
        },
      });
      if (!saveResult.success) {
        setError(saveResult.error || '保存全局 Agent 配置失败');
        return;
      }

      setSaveMessage('全局 Agent 配置已保存，重启 Gateway 后会按新配置重新生成派生文件');
      setGlobalAgentConfigOpen(false);
      setGlobalAgentConfigDraft(null);
      await loadWorkspace();
    } catch (globalConfigError) {
      setError(`保存全局 Agent 配置时发生异常: ${globalConfigError instanceof Error ? globalConfigError.message : String(globalConfigError)}`);
    } finally {
      setGlobalAgentConfigSaving(false);
    }
  };

  // 打开新增绑定编辑器（mode=add）
  const openAddBindingEditor = () => {
    if (!agentId) {
      return;
    }

    setError(null);
    setSaveMessage(null);

    // 初始化空绑定模板
    const emptyDraft = {
      binding: {
        agentId,
        match: { channel: '', accountId: '' },
        enabled: true,
      },
      accountConfig: null,
    };

    setGlobalBindingEditor({
      mode: 'add',
      index: -1,
      binding: emptyDraft.binding,
      accountConfig: null,
    });
    setGlobalBindingDraft(emptyDraft);
    setGlobalBindingBaseline(emptyDraft);
  };

  const openGlobalBindingEditor = (index: number) => {
    const bindingRecord = details?.globalAgentConfig?.bindings?.[index];
    if (!bindingRecord) {
      return;
    }

    setError(null);
    setSaveMessage(null);
    setGlobalBindingEditor({
      mode: 'edit',
      index,
      channel: bindingRecord.channel,
      accountId: bindingRecord.accountId,
      binding: bindingRecord.binding,
      accountConfig: bindingRecord.accountConfig,
    });
    const nextDraft = {
      binding: bindingRecord.binding,
      accountConfig: bindingRecord.accountConfig ?? null,
    };
    setGlobalBindingDraft(nextDraft);
    setGlobalBindingBaseline(nextDraft);
  };

  const closeGlobalBindingEditor = () => {
    if (!globalBindingEditor) {
      return;
    }

    if (toCanonicalJsonString(globalBindingDraft) !== toCanonicalJsonString(globalBindingBaseline)) {
      const shouldClose = window.confirm(t('binding.unsavedChanges'));
      if (!shouldClose) {
        return;
      }
    }

    setGlobalBindingEditor(null);
    setGlobalBindingDraft(null);
    setGlobalBindingBaseline(null);
  };

  // 新增绑定：验证、构造记录、写入配置
  const handleAddBinding = async () => {
    if (!agentId || !globalBindingEditor) {
      return;
    }

    const draft = globalBindingDraft || {};
    const bindingData = draft.binding || {};
    const channel = typeof bindingData?.match?.channel === 'string'
      ? bindingData.match.channel.trim()
      : '';
    const accountId = typeof bindingData?.match?.accountId === 'string'
      ? bindingData.match.accountId.trim()
      : '';

    // 通道名称不能为空
    if (!channel) {
      setError(t('binding.channelRequired'));
      return;
    }

    setGlobalBindingSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      // 读取当前配置
      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(`${t('binding.loadFailed')}: ${configResult.error || ''}`);
        return;
      }

      const bindings = Array.isArray(configResult.config?.bindings)
        ? [...configResult.config.bindings]
        : [];

      // 构造新的绑定记录（仅保留 agentId + match，不写入 enabled 等 schema 不支持的字段）
      const { enabled: _enabled, ...cleanBindingData } = (bindingData || {}) as Record<string, unknown>;
      const newBinding = {
        ...cleanBindingData,
        agentId,
        match: { channel, accountId },
      };
      bindings.push(newBinding);

      const nextConfig = {
        ...configResult.config,
        bindings,
      } as any;

      // 如有账号配置且非空，写入 channels 节点
      // 避免写入空对象导致已有配置被覆盖或创建无效账号
      const accountConfig = draft.accountConfig;
      if (accountConfig && typeof accountConfig === 'object' && Object.keys(accountConfig).length > 0 && channel && accountId) {
        nextConfig.channels = {
          ...(nextConfig.channels || {}),
          [channel]: {
            ...(nextConfig.channels?.[channel] || {}),
            accounts: {
              ...(nextConfig.channels?.[channel]?.accounts || {}),
              [accountId]: accountConfig,
            },
          },
        };
      }

      // 写回配置
      const saveResult = await window.electronAPI.configSet(nextConfig);
      if (!saveResult.success) {
        setError(`${t('binding.saveFailed')}: ${saveResult.error || ''}`);
        return;
      }

      // 成功：关闭弹窗、提示、刷新
      setSaveMessage(t('binding.addSuccess'));
      setGlobalBindingEditor(null);
      setGlobalBindingDraft(null);
      setGlobalBindingBaseline(null);
      await loadWorkspace();
    } catch (addError) {
      setError(`${t('binding.saveFailed')}: ${addError instanceof Error ? addError.message : String(addError)}`);
    } finally {
      setGlobalBindingSaving(false);
    }
  };

  const handleSaveGlobalBindingConfig = async () => {
    if (!agentId || !globalBindingEditor) {
      return;
    }

    // 根据 mode 分发到新增或编辑逻辑
    if (globalBindingEditor.mode === 'add') {
      await handleAddBinding();
      return;
    }

    setGlobalBindingSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const parsed = globalBindingDraft || {};
      const nextBinding = parsed?.binding;
      const nextAccountConfig = parsed?.accountConfig;

      if (!nextBinding || typeof nextBinding !== 'object' || Array.isArray(nextBinding)) {
        setError('binding 必须是一个对象');
        return;
      }

      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(`${t('binding.loadFailed')}: ${configResult.error || ''}`);
        return;
      }

      const bindings = Array.isArray(configResult.config?.bindings)
        ? [...configResult.config.bindings]
        : [];
      const agentBindingIndexes = bindings
        .map((binding: any, index: number) => ({ binding, index }))
        .filter((item) => item.binding?.agentId === agentId);
      const target = agentBindingIndexes[globalBindingEditor.index];

      if (!target) {
        setError('未找到对应的绑定配置');
        return;
      }

      // 编辑绑定时清理 schema 不支持的字段（如 enabled）
      const { enabled: _enabled, ...cleanNextBinding } = (nextBinding as Record<string, unknown>);
      bindings[target.index] = {
        ...target.binding,
        ...cleanNextBinding,
      };
      // 同时清理原始 binding 中可能残留的 enabled 字段
      delete (bindings[target.index] as any).enabled;

      const nextConfig = {
        ...configResult.config,
        bindings,
      } as any;

      const channel = typeof nextBinding?.match?.channel === 'string'
        ? nextBinding.match.channel
        : globalBindingEditor.channel;
      const accountId = typeof nextBinding?.match?.accountId === 'string'
        ? nextBinding.match.accountId
        : globalBindingEditor.accountId;

      // 写入 channels 节点：仅当用户实际填写了账号配置时才覆盖
      // 避免将已有的完整账号配置覆盖为空对象
      if (channel && accountId) {
        const existingAccountConfig = nextConfig.channels?.[channel]?.accounts?.[accountId];
        // 仅当用户提供了非空的 accountConfig 时才写入
        if (nextAccountConfig && typeof nextAccountConfig === 'object' && Object.keys(nextAccountConfig).length > 0) {
          nextConfig.channels = {
            ...(nextConfig.channels || {}),
            [channel]: {
              ...(nextConfig.channels?.[channel] || {}),
              accounts: {
                ...(nextConfig.channels?.[channel]?.accounts || {}),
                [accountId]: nextAccountConfig,
              },
            },
          };
        } else if (!existingAccountConfig) {
          // 账号配置不存在且用户未填写，不创建空记录
          // 保持 channels 节点不变
        }
      }

      const saveResult = await window.electronAPI.configSet(nextConfig);
      if (!saveResult.success) {
        setError(`${t('binding.saveFailed')}: ${saveResult.error || ''}`);
        return;
      }

      setSaveMessage(t('binding.saveSuccess'));
      setGlobalBindingEditor(null);
      setGlobalBindingDraft(null);
      setGlobalBindingBaseline(null);
      await loadWorkspace();
    } catch (bindingError) {
      setError(`${t('binding.saveFailed')}: ${bindingError instanceof Error ? bindingError.message : String(bindingError)}`);
    } finally {
      setGlobalBindingSaving(false);
    }
  };

  // 删除绑定：弹出确认对话框，确认后从配置中移除
  const handleDeleteBinding = async (bindingIndex: number) => {
    if (!agentId) {
      return;
    }

    const bindingRecord = globalAgentConfig?.bindings?.[bindingIndex];
    if (!bindingRecord) {
      setError('未找到对应的绑定配置');
      return;
    }

    // 弹出确认对话框
    const detail = t('binding.confirmDeleteDetail')
      .replace('{channel}', bindingRecord.channel || '-')
      .replace('{accountId}', bindingRecord.accountId || '-');
    const shouldDelete = window.confirm(`${t('binding.confirmDelete')}\n${detail}`);
    if (!shouldDelete) {
      return;
    }

    setDeletingBindingIndex(bindingIndex);
    setBindingDeleting(true);
    setError(null);
    setSaveMessage(null);

    try {
      // 读取当前配置
      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(`${t('binding.loadFailed')}: ${configResult.error || ''}`);
        return;
      }

      const bindings = Array.isArray(configResult.config?.bindings)
        ? [...configResult.config.bindings]
        : [];

      // 定位当前 Agent 的第 bindingIndex 条绑定在全局数组中的实际索引
      const agentBindingIndexes = bindings
        .map((b: any, i: number) => ({ binding: b, index: i }))
        .filter((item) => item.binding?.agentId === agentId);

      if (bindingIndex < 0 || bindingIndex >= agentBindingIndexes.length) {
        setError('未找到对应的绑定配置');
        return;
      }

      const globalIndex = agentBindingIndexes[bindingIndex].index;
      bindings.splice(globalIndex, 1);

      // 写回配置
      const saveResult = await window.electronAPI.configSet({
        ...configResult.config,
        bindings,
      });
      if (!saveResult.success) {
        setError(`${t('binding.deleteFailed')}: ${saveResult.error || ''}`);
        return;
      }

      setSaveMessage(t('binding.deleteSuccess'));
      await loadWorkspace();
    } catch (deleteError) {
      setError(`${t('binding.deleteFailed')}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    } finally {
      setBindingDeleting(false);
      setDeletingBindingIndex(null);
    }
  };

  const openMemoryEditor = async (targetPath: string) => {
    if (!agentId) {
      return;
    }

    setMemoryLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsReadMemoryFile(agentId, targetPath);
      if (!result.success || !result.file) {
        setError(result.error || '读取智能体记忆失败');
        return;
      }

      setActiveMemoryPath(targetPath);
      setMemoryFile(result.file);
      setMemoryDraft(result.file.content || '');
      setMemoryEditorOpen(true);
    } catch (memoryError) {
      setError(`读取智能体记忆时发生异常: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    } finally {
      setMemoryLoading(false);
    }
  };

  const closeMemoryEditor = () => {
    if (isMemoryDirty) {
      const shouldClose = window.confirm('你有未保存的记忆修改，确认关闭吗？');
      if (!shouldClose) {
        return;
      }
    }

    setMemoryEditorOpen(false);
  };

  const handleSaveMemory = async () => {
    if (!agentId || !activeMemoryPath) {
      return;
    }

    setMemorySaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsSaveMemoryFile(agentId, activeMemoryPath, memoryDraft);
      if (!result.success || !result.file) {
        setError(result.error || '保存智能体记忆失败');
        return;
      }

      setMemoryFile(result.file);
      setMemoryDraft(result.file.content || '');
      setSaveMessage(`${result.file.name} 已保存`);
      await loadWorkspace();
    } catch (memoryError) {
      setError(`保存智能体记忆时发生异常: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    } finally {
      setMemorySaving(false);
    }
  };

  const handleClearMemory = async () => {
    if (!agentId || !activeMemoryPath || !memoryFile) {
      return;
    }

    const shouldClear = window.confirm(`确认清空记忆文件 ${memoryFile.name} 吗？此操作会清空文件内容。`);
    if (!shouldClear) {
      return;
    }

    setMemoryClearing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsClearMemoryFile(agentId, activeMemoryPath);
      if (!result.success || !result.file) {
        setError(result.error || '清空智能体记忆失败');
        return;
      }

      setMemoryFile(result.file);
      setMemoryDraft(result.file.content || '');
      setSaveMessage(`${result.file.name} 已清空`);
      await loadWorkspace();
    } catch (memoryError) {
      setError(`清空智能体记忆时发生异常: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    } finally {
      setMemoryClearing(false);
    }
  };

  const loadFile = async (fileName: AgentWorkspaceFileName) => {
    if (!agentId) {
      return;
    }

    setFileLoading(true);
    setSaveMessage(null);
    setError(null);

    try {
      const result = await window.electronAPI.agentsReadWorkspaceFile(agentId, fileName);
      if (!result.success || !result.file) {
        setError(result.error || `读取 ${fileName} 失败`);
        return;
      }

      const loadedFile = result.file;

      setFileState((current) => ({
        ...current,
        [fileName]: loadedFile,
      }));
      setDrafts((current) => ({
        ...current,
        [fileName]: loadedFile.content || '',
      }));
    } catch (loadError) {
      console.error(`Failed to load workspace file ${fileName}:`, loadError);
      setError(`读取 ${fileName} 时发生异常`);
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    setDetails(null);
    setFileState({});
    setDrafts({});
    setSaveMessage(null);
    setEditorOpen(false);
    setRenamingEntry(null);
    setDeletingEntry(null);
    setTrashOpen(false);
    setTrashEntries([]);
    setTrashRoot(null);
    setSelectedTrashEntryIds([]);
    setTrashBatchAction(null);
    setMemoryEditorOpen(false);
    setActiveMemoryPath(null);
    setMemoryFile(null);
    setMemoryDraft('');
    setEntryBrowserOpen(null);
    setWorkspaceBrowse(null);
    setSkillsConfigPreviewOpen(false);
    setSkillsConfigPreview('');
    setGlobalAgentConfigOpen(false);
    setGlobalAgentConfigDraft(null);
    setGlobalModelEditorOpen(false);
    setGlobalModelEditor({ primary: '', fallbacks: [] });
    setGlobalModelOptions([]);
    setGlobalBindingEditor(null);
    setGlobalBindingDraft(null);
    setGlobalBindingBaseline(null);
    setDeletingBindingIndex(null);
    setBindingDeleting(false);
    setManagedFileOpen(false);
    setManagedFile(null);
    setManagedDraft('');
    setManagedJsonDraft(null);
    setManagedJsonBaseline(null);
    loadWorkspace();
  }, [agentId]);

  useEffect(() => {
    if (!activeFile) {
      return;
    }

    if (!fileState[activeFile]) {
      loadFile(activeFile);
    }
  }, [activeFile, agentId]);

  const currentFile = fileState[activeFile];
  const currentDraft = drafts[activeFile] ?? currentFile?.content ?? '';
  const currentSummary = useMemo<AgentWorkspaceFileSummary | undefined>(
    () => details?.files.find((item) => item.name === activeFile),
    [activeFile, details],
  );
  const isDirty = currentDraft !== (currentFile?.content ?? '');
  const isMemoryDirty = memoryDraft !== (memoryFile?.content ?? '');
  const isManagedJson = Boolean(managedFile && isJsonLikeFile(managedFile.name));
  const isManagedSessionLog = Boolean(managedFile && isSessionLogFile(managedFile.name));
  const managedSerializedContent = isManagedJson
    ? toCanonicalJsonString(managedJsonDraft)
    : managedDraft;
  const isManagedDirty = isManagedJson
    ? toCanonicalJsonString(managedJsonDraft) !== toCanonicalJsonString(managedJsonBaseline)
    : managedSerializedContent !== (managedFile?.content ?? '');
  const managedSessionEvents = useMemo(() => isManagedSessionLog ? parseSessionEvents(managedDraft) : [], [isManagedSessionLog, managedDraft]);
  const skillsOverview = details?.skillsOverview;
  const globalAgentConfig = details?.globalAgentConfig as AgentGlobalConfigOverview | undefined;
  const globalBindingTabs = useMemo<JsonFormTabItem[]>(() => ([
    { key: 'binding', label: t('binding.bindingRules') },
    {
      key: 'accountConfig',
      label: t('binding.accountConfig'),
      // 新建绑定时 accountConfig 为空，给用户友好的解释
      emptyHint: t('binding.accountConfigEmptyHint'),
    },
  ]), [t]);
  const globalBindingSchema = useMemo<JsonFormSchema>(() => {
    // 从全局 channels 配置中提取所有已配置的渠道类型作为通道选项
    const channelOptions = Object.keys(globalChannels)
      .filter((key) => Boolean(key))
      .map((value) => ({ label: value, value }));

    // 根据当前绑定草稿中选中的通道，动态提取该通道下的账号列表
    const selectedChannel = globalBindingDraft?.binding?.match?.channel || '';
    const channelConfig = selectedChannel ? globalChannels[selectedChannel] : null;
    const accountsFromChannel = channelConfig?.accounts
      ? Object.keys(channelConfig.accounts).map((value) => ({ label: value, value }))
      : [];

    // 兜底：如果全局 channels 没有数据，也从已有 bindings 中提取（向后兼容）
    const fallbackChannelOptions = channelOptions.length === 0
      ? Array.from(new Set((globalAgentConfig?.bindings || [])
          .map((item) => item.channel)
          .filter((value): value is string => Boolean(value))))
          .map((value) => ({ label: value, value }))
      : channelOptions;

    const fallbackAccountOptions = accountsFromChannel.length === 0
      ? Array.from(new Set((globalAgentConfig?.bindings || [])
          .map((item) => item.accountId)
          .filter((value): value is string => Boolean(value))))
          .map((value) => ({ label: value, value }))
      : accountsFromChannel;

    return {
      binding: {
        label: '绑定规则',
        description: '定义当前 Agent 在什么条件下命中这条绑定，决定消息从哪个渠道、哪个账号路由到此 Agent。',
      },
      'binding.match': {
        label: '命中条件',
        description: '当用户消息满足以下条件时，会被路由到当前 Agent 处理。',
      },
      'binding.match.channel': {
        label: '通道（Channel）',
        description: '选择一个已配置的消息渠道（如 WeChat、Telegram、Slack 等）。渠道需要先在 Settings → Channels 中添加。',
        control: fallbackChannelOptions.length ? 'select' : 'text',
        options: fallbackChannelOptions,
        placeholder: fallbackChannelOptions.length ? '请选择通道' : '暂无可用通道，请先在 Settings → Channels 中添加',
      },
      'binding.match.accountId': {
        label: '账号（Account）',
        description: '账号是渠道下的具体接入身份（如一个 Bot 账号、一个公众号等）。选择通道后，这里会列出该通道下已配置的所有账号。如果没有可选项，请先在 Settings → Channels 中为对应通道添加账号。',
        control: fallbackAccountOptions.length ? 'select' : 'text',
        options: fallbackAccountOptions,
        placeholder: fallbackAccountOptions.length ? '请选择账号' : '请先选择通道，或在 Settings → Channels 中为通道添加账号',
      },
      'binding.agentId': {
        label: 'Agent ID',
        description: '当前绑定归属的 Agent，系统自动填写，无需手动修改。',
        readOnly: true,
      },

      accountConfig: {
        label: '账号运行配置',
        description: '该绑定对应账号的运行参数。新建绑定时为空，保存后会自动关联渠道中的账号配置。如需为此 Agent 单独定制参数，可在此覆盖默认值。',
      },
      'accountConfig.apiKey': {
        label: 'API Key',
        description: '该账号的接口密钥，用于鉴权。留空则使用渠道默认配置。',
        control: 'textarea',
        placeholder: '请输入 API Key（留空使用默认值）',
      },
      'accountConfig.baseUrl': {
        label: 'Base URL',
        description: '接口基础地址。留空则使用渠道默认配置。',
        placeholder: '请输入接口地址（留空使用默认值）',
      },
      'accountConfig.model': {
        label: '模型',
        description: '该账号使用的模型标识。留空则使用渠道默认配置。',
      },
      'accountConfig.enabled': {
        label: '账号启用状态',
        description: '控制该账号配置是否可用。关闭后此账号将不会被使用。',
        control: 'switch',
      },
    };
  }, [globalAgentConfig, globalChannels, globalBindingDraft]);
  const globalAgentConfigTabs = useMemo<JsonFormTabItem[]>(() => getTopLevelSections(globalAgentConfigDraft).map((section) => ({
    key: section,
    label: section,
  })), [globalAgentConfigDraft]);
  const globalModelOptionMap = useMemo(() => Object.fromEntries(globalModelOptions.map((item) => [item.value, item.label])), [globalModelOptions]);
  const globalModelSelectOptions = useMemo<AppSelectOption[]>(() => globalModelOptions.map((item) => ({
    label: item.label,
    value: item.value,
    description: item.description,
  })), [globalModelOptions]);
  const globalPrimaryModelLabel = useMemo(() => {
    const modelKey = globalAgentConfig?.modelPrimary;

    if (!modelKey) {
      return '未配置';
    }

    return globalModelOptionMap[modelKey] || modelKey;
  }, [globalAgentConfig?.modelPrimary, globalModelOptionMap]);
  const workspaceCanGoUp = useMemo(() => {
    if (!workspaceBrowse?.currentPath || !workspaceBrowse.rootPath) {
      return false;
    }

    return workspaceBrowse.currentPath !== workspaceBrowse.rootPath;
  }, [workspaceBrowse]);

  const workspaceParentPath = useMemo(() => {
    if (!workspaceCanGoUp || !workspaceBrowse?.currentPath) {
      return undefined;
    }

    const segments = workspaceBrowse.currentPath.split('/');
    segments.pop();
    return segments.join('/') || workspaceBrowse.rootPath;
  }, [workspaceBrowse, workspaceCanGoUp]);

  const openEditor = async (fileName: AgentWorkspaceFileName) => {
    setActiveFile(fileName);
    if (!fileState[fileName]) {
      await loadFile(fileName);
    }
    setEditorOpen(true);
  };

  const openSkillsConfigPreview = async () => {
    setError(null);

    try {
      const result = await window.electronAPI.configGet();
      if (!result.success || !result.config) {
        setError(result.error || '读取原始配置失败');
        return;
      }

      const preview = {
        commands: {
          nativeSkills: result.config?.commands?.nativeSkills,
        },
        tools: result.config?.tools,
        agents: {
          defaults: {
            subagents: result.config?.agents?.defaults?.subagents,
          },
          current: (result.config?.agents?.list || []).find((agent: any) => agent?.id === agentId) || null,
        },
        bindings: (result.config?.bindings || []).filter((binding: any) => binding?.agentId === agentId),
      };

      setSkillsConfigPreview(JSON.stringify(preview, null, 2));
      setSkillsConfigPreviewOpen(true);
    } catch (previewError) {
      setError(`读取原始配置时发生异常: ${previewError instanceof Error ? previewError.message : String(previewError)}`);
    }
  };

  const closeEditor = () => {
    if (isDirty) {
      const shouldClose = window.confirm('你有未保存的修改，确认关闭编辑器吗？');
      if (!shouldClose) {
        return;
      }
    }

    setEditorOpen(false);
  };

  const handleSave = async () => {
    if (!agentId) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const result = await window.electronAPI.agentsSaveWorkspaceFile(
        agentId,
        activeFile,
        currentDraft,
      );
      if (!result.success || !result.file) {
        setError(result.error || `保存 ${activeFile} 失败`);
        return;
      }

      const savedFile = result.file;
      const nextFile: AgentWorkspaceFileDetail = {
        name: savedFile.name,
        path: savedFile.path,
        exists: true,
        size: savedFile.size,
        updatedAt: savedFile.updatedAt,
        content: currentDraft,
      };

      setFileState((current) => ({
        ...current,
        [activeFile]: nextFile,
      }));
      setDetails((current) => current
        ? {
            ...current,
            files: current.files.map((item) => item.name === activeFile
              ? {
                  name: savedFile.name,
                  path: savedFile.path,
                  exists: savedFile.exists,
                  size: savedFile.size,
                  updatedAt: savedFile.updatedAt,
                }
              : item),
          }
        : current);
      setSaveMessage(`${activeFile} 已保存`);
    } catch (saveError) {
      console.error(`Failed to save workspace file ${activeFile}:`, saveError);
      setError(`保存 ${activeFile} 时发生异常`);
    } finally {
      setSaving(false);
    }
  };

  const handleGatewayRestart = async () => {
    setRestartingGateway(true);
    setSaveMessage(null);
    setError(null);

    try {
      const result = await window.electronAPI.gatewayRestart();
      if (!result.success) {
        setError(result.error || '重启 Gateway 失败');
        return;
      }

      setSaveMessage('Gateway 已触发重启');
    } catch (restartError) {
      console.error('Failed to restart gateway:', restartError);
      setError(`重启 Gateway 时发生异常: ${restartError instanceof Error ? restartError.message : String(restartError)}`);
    } finally {
      setRestartingGateway(false);
    }
  };

  const loadTrashEntries = async () => {
    if (!agentId) {
      return;
    }

    setTrashLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.agentsListWorkspaceTrash(agentId);
      if (!result.success) {
        setError(result.error || '加载回收站失败');
        return;
      }

      setTrashRoot(result.trashRoot || null);
      setTrashEntries(result.entries || []);
      setSelectedTrashEntryIds((current) => current.filter((id) => (result.entries || []).some((entry) => entry.id === id)));
    } catch (loadError) {
      setError(`加载回收站时发生异常: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
    } finally {
      setTrashLoading(false);
    }
  };

  const openTrashModal = async () => {
    setTrashOpen(true);
    setSelectedTrashEntryIds([]);
    await loadTrashEntries();
  };

  const toggleTrashEntrySelection = (trashEntryId: string) => {
    setSelectedTrashEntryIds((current) => current.includes(trashEntryId)
      ? current.filter((id) => id !== trashEntryId)
      : [...current, trashEntryId]);
  };

  const handleSelectAllTrashEntries = () => {
    if (selectedTrashEntryIds.length === trashEntries.length) {
      setSelectedTrashEntryIds([]);
      return;
    }

    setSelectedTrashEntryIds(trashEntries.map((entry) => entry.id));
  };

  const handleRenameClick = (entry: AgentWorkspaceEntry) => {
    setRenamingEntry(entry);
    setRenameValue(entry.name);
  };

  const handleRenameSubmit = async () => {
    if (!agentId || !renamingEntry) {
      return;
    }

    setRenameSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsRenameWorkspaceEntry(agentId, renamingEntry.path, renameValue);
      if (!result.success) {
        setError(result.error || '重命名失败');
        return;
      }

      setSaveMessage(`${renamingEntry.name} 已重命名为 ${renameValue.trim()}`);
      setRenamingEntry(null);
      setRenameValue('');
      await loadWorkspace();
    } catch (renameError) {
      setError(`重命名时发生异常: ${renameError instanceof Error ? renameError.message : String(renameError)}`);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!agentId || !deletingEntry) {
      return;
    }

    setDeleteSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsDeleteWorkspaceEntry(agentId, deletingEntry.path);
      if (!result.success) {
        setError(result.error || '删除失败');
        return;
      }

      setSaveMessage(`${deletingEntry.name} 已移入回收站`);
      setDeletingEntry(null);
      await loadWorkspace();
      if (trashOpen) {
        await loadTrashEntries();
      }
    } catch (deleteError) {
      setError(`删除时发生异常: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleRestoreTrashEntry = async (trashEntryId: string) => {
    if (!agentId) {
      return;
    }

    setTrashRestoringId(trashEntryId);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsRestoreWorkspaceTrashEntry(agentId, trashEntryId);
      if (!result.success) {
        setError(result.error || '恢复失败');
        return;
      }

      setSaveMessage('文件已从回收站恢复');
      await Promise.all([loadTrashEntries(), loadWorkspace()]);
    } catch (restoreError) {
      setError(`恢复时发生异常: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
    } finally {
      setTrashRestoringId(null);
    }
  };

  const handleRestoreSelectedTrashEntries = async () => {
    if (!agentId || !selectedTrashEntryIds.length) {
      return;
    }

    setTrashBatchAction('restore');
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsRestoreWorkspaceTrashEntries(agentId, selectedTrashEntryIds);
      if (!result.success) {
        setError(result.error || '批量恢复失败');
        return;
      }

      setSaveMessage(`已恢复 ${result.restoredPaths?.length || selectedTrashEntryIds.length} 个回收站条目`);
      setSelectedTrashEntryIds([]);
      await Promise.all([loadTrashEntries(), loadWorkspace()]);
    } catch (restoreError) {
      setError(`批量恢复时发生异常: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
    } finally {
      setTrashBatchAction(null);
    }
  };

  const handleDeleteSelectedTrashEntries = async () => {
    if (!agentId || !selectedTrashEntryIds.length) {
      return;
    }

    const shouldDelete = window.confirm(`确认永久删除已选中的 ${selectedTrashEntryIds.length} 个回收站条目吗？此操作不可恢复。`);
    if (!shouldDelete) {
      return;
    }

    setTrashBatchAction('delete');
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsDeleteWorkspaceTrashEntries(agentId, selectedTrashEntryIds);
      if (!result.success) {
        setError(result.error || '批量删除失败');
        return;
      }

      setSaveMessage(`已永久删除 ${result.deletedIds?.length || selectedTrashEntryIds.length} 个回收站条目`);
      setSelectedTrashEntryIds([]);
      await loadTrashEntries();
    } catch (deleteError) {
      setError(`批量删除时发生异常: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    } finally {
      setTrashBatchAction(null);
    }
  };

  const handleClearTrash = async () => {
    if (!agentId || !trashEntries.length) {
      return;
    }

    const shouldClear = window.confirm(`确认一键清空回收站吗？当前共有 ${trashEntries.length} 个条目，此操作不可恢复。`);
    if (!shouldClear) {
      return;
    }

    setTrashBatchAction('clear');
    setError(null);
    setSaveMessage(null);

    try {
      const result = await window.electronAPI.agentsClearWorkspaceTrash(agentId);
      if (!result.success) {
        setError(result.error || '清空回收站失败');
        return;
      }

      setSaveMessage(`回收站已清空，共删除 ${result.deletedCount || 0} 个条目`);
      setSelectedTrashEntryIds([]);
      await loadTrashEntries();
    } catch (clearError) {
      setError(`清空回收站时发生异常: ${clearError instanceof Error ? clearError.message : String(clearError)}`);
    } finally {
      setTrashBatchAction(null);
    }
  };

  return (
    /* 页面内容区域：使用 page-content 统一内边距 --space-6 */
    <div className="min-h-screen page-content" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate('/agents')}
                className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-token-normal cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回 Agents
              </button>
            </div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--app-text)' }}>
              {details?.agent.name || agentId || 'Agent Workspace'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
              你可以在这里独立编辑 Agent 的核心工作区文件，支持即时保存到实际目录。
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 重启 Gateway 按钮：loading 时自动显示 spinner */}
            <AppButton
              variant="primary"
              onClick={handleGatewayRestart}
              loading={restartingGateway}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              重启 Gateway
            </AppButton>
            {/* 刷新工作区按钮 */}
            <AppButton
              variant="secondary"
              onClick={loadWorkspace}
              loading={loading}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              刷新
            </AppButton>
          </div>
        </div>

        {error && (
          <div className="p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)' }}>
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {saveMessage && (
          <div className="p-4 border rounded-lg" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.22)', color: '#10B981' }}>
            {saveMessage}
          </div>
        )}

        {/* ── 垂直排列，每个卡片跨满整行，内部各自做响应式布局 ── */}
        <div className="space-y-6">

            {/* ── 核心文件（内部文件项网格排列） ── */}
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">核心文件</h2>
              </div>
              <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                选择任意核心文件进入沉浸式编辑弹窗，减少误操作，保存体验更明确。
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {CORE_FILES.map((fileName) => {
                  const summary = details?.files.find((item) => item.name === fileName);
                  const selected = activeFile === fileName;
                  const hasDraft = drafts[fileName] !== undefined;
                  const draftDirty = hasDraft && drafts[fileName] !== (fileState[fileName]?.content ?? '');

                  return (
                    <div
                      key={fileName}
                      className={`p-4 rounded-xl border interactive-card ${selected ? 'interactive-card--selected' : ''}`}
                      style={selected
                        ? {
                            background: 'var(--app-selected-card-bg)',
                            borderColor: 'var(--app-selected-card-border)',
                            boxShadow: 'var(--app-selected-card-shadow)',
                            color: 'var(--app-selected-card-text)',
                          }
                        : {
                            backgroundColor: 'var(--app-bg-subtle)',
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text)',
                          }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{fileName}</span>
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: selected ? 'var(--app-selected-badge-bg)' : 'rgba(59,130,246,0.12)', color: selected ? 'var(--app-selected-badge-text)' : '#3B82F6' }}>
                              {summary?.exists ? '已存在' : '待创建'}
                            </span>
                            {draftDirty && (
                              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: selected ? 'var(--app-selected-badge-bg)' : 'rgba(245, 158, 11, 0.14)', color: selected ? 'var(--app-selected-badge-text)' : '#F59E0B' }}>
                                未保存
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-xs" style={{ color: selected ? 'var(--app-selected-card-text)' : 'var(--app-text-muted)' }}>
                            {summary ? `${formatBytes(summary.size)} · ${formatTimestamp(summary.updatedAt)}` : '未加载'}
                          </div>
                          <div className="mt-2 text-xs truncate" style={{ color: selected ? 'var(--app-selected-card-text)' : 'var(--app-text-muted)' }}>
                            {summary?.path || '等待加载文件路径'}
                          </div>
                        </div>
                        <AppButton
                          onClick={() => openEditor(fileName)}
                          className="shrink-0"
                          size="sm"
                          variant={selected ? 'primary' : 'secondary'}
                        >
                          编辑
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* ── Agent 运行配置 ── */}
            <GlassCard className="p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Agent 运行配置</h2>
                </div>
              </div>
              <code className="block mt-1 break-all text-sm" style={{ color: 'var(--app-text)' }}>
                {globalAgentConfig?.configPath || '未检测到 Global Agent 配置文件'}
              </code>
              <div className="mb-4 mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                汇总当前 Agent 的 Skills 运行状态、全局核心配置与绑定关系，便于统一查看和编辑。
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-violet-400" />
                      <h3 className="text-base font-semibold">Skills 运行配置</h3>
                    </div>
                    <AppButton onClick={openSkillsConfigPreview} size="sm" variant="secondary">
                      查看原始配置
                    </AppButton>
                  </div>
                  <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    汇总当前 Agent 的 Skills 启用状态、来源位置、绑定通道与账号，便于快速判断真实运行能力。
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                              当前状态
                            </div>
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                              {/* Native Skills 启用状态 badge */}
                              <AppBadge
                                variant={skillsOverview?.nativeSkillsEnabled ? 'success' : 'neutral'}
                                icon={<CheckCircle2 className="w-4 h-4" />}
                              >
                                {skillsOverview?.nativeSkillsEnabled ? 'Native Skills 已启用' : 'Native Skills 已关闭'}
                              </AppBadge>
                              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                                模式：
                                <span className="font-semibold" style={{ color: 'var(--app-text)' }}>
                                  {skillsOverview?.nativeSkillsMode || 'auto'}
                                </span>
                              </div>
                              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                                Tools Profile：
                                <span className="font-semibold" style={{ color: 'var(--app-text)' }}>
                                  {skillsOverview?.toolsProfile || 'full'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(139, 92, 246, 0.10)', border: '1px solid rgba(139, 92, 246, 0.16)' }}>
                            <div className="text-[11px] uppercase tracking-wide" style={{ color: '#8B5CF6' }}>
                              子智能体调度
                            </div>
                            <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                              最大并发 {skillsOverview?.maxConcurrent || 0}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-4">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                            <Info className="w-3.5 h-3.5" />
                            来源说明
                          </div>
                          <div className="flex flex-wrap gap-2.5">
                            {(skillsOverview?.sourceLabels || []).map((label) => (
                              <div
                                key={label}
                                className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-medium leading-5"
                                style={{
                                  backgroundColor: 'var(--app-bg-subtle)',
                                  border: '1px solid var(--app-border)',
                                  color: 'var(--app-text)',
                                }}
                              >
                                {label}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-sky-400" />
                      <h3 className="text-base font-semibold">全局 Agent 核心配置</h3>
                    </div>
                    <AppButton onClick={openGlobalAgentConfigEditor} variant="secondary" size="sm">
                      编辑全局配置
                    </AppButton>
                  </div>
                  <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    当前以 `openclaw.json` 中 `agents.list[]` 的当前 Agent 条目为准。`models.json`、`auth-profiles.json` 等本地文件视为派生结果，通常由 Gateway 重启后再生成。
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                            模型配置
                          </div>
                          <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                            当前模型与备选模型使用同一套配置入口，统一在一个弹窗中编辑。
                          </div>
                        </div>
                        <AppButton onClick={openGlobalModelEditor} size="sm" variant="secondary">
                          编辑模型
                        </AppButton>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border px-4 py-3.5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                            当前模型
                          </div>
                          <div className="mt-2 text-base font-semibold break-all" style={{ color: 'var(--app-text)' }}>
                            {globalPrimaryModelLabel}
                          </div>
                          <div className="mt-1.5 text-xs break-all" style={{ color: 'var(--app-text-muted)' }}>
                            默认主模型：{globalAgentConfig?.modelPrimary || '未显式配置'}
                          </div>
                        </div>

                        <div className="rounded-xl border px-4 py-3.5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                              备选模型
                            </div>
                            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              {globalAgentConfig?.modelFallbacks?.length ? `${globalAgentConfig.modelFallbacks.length} 项` : '未配置'}
                            </div>
                          </div>

                          {globalAgentConfig?.modelFallbacks?.length ? (
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {globalAgentConfig.modelFallbacks.map((fallback) => (
                                <div
                                  key={fallback}
                                  className="rounded-xl border px-3.5 py-3"
                                  style={{
                                    backgroundColor: 'var(--app-bg)',
                                    borderColor: 'rgba(148, 163, 184, 0.18)',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                                        {globalModelOptionMap[fallback] || fallback}
                                      </div>
                                      <div className="mt-1 text-xs break-all" style={{ color: 'var(--app-text-muted)' }}>
                                        {fallback}
                                      </div>
                                    </div>
                                    {/* 备选模型标记 badge */}
                                    <AppBadge variant="neutral" size="sm">备选</AppBadge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)', backgroundColor: 'var(--app-bg)' }}>
                              当前未配置备选模型。
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                          全局 Workspace
                        </div>
                        <code className="block mt-2 text-sm break-all" style={{ color: 'var(--app-text)' }}>
                          {globalAgentConfig?.workspace || '-'}
                        </code>
                      </div>
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                          全局 AgentDir
                        </div>
                        <code className="block mt-2 text-sm break-all" style={{ color: 'var(--app-text)' }}>
                          {globalAgentConfig?.agentDir || '-'}
                        </code>
                      </div>
                    </div>

                    <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                        子智能体允许范围
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {globalAgentConfig?.allowAgents?.length ? globalAgentConfig.allowAgents.map((agentName) => (
                          <span
                            key={agentName}
                            className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-medium"
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.10)',
                              border: '1px solid rgba(16, 185, 129, 0.16)',
                              color: '#047857',
                            }}
                          >
                            {agentName}
                          </span>
                        )) : (
                          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                            当前未配置子智能体允许范围。
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                          Channel / Binding 配置
                        </div>
                        {/* 添加绑定按钮 */}
                        <AppButton onClick={openAddBindingEditor} variant="secondary" size="sm">
                          {t('binding.addBinding')}
                        </AppButton>
                      </div>
                      <div className="mt-3 space-y-3">
                        {globalAgentConfig?.bindings?.length ? globalAgentConfig.bindings.map((item, index) => (
                          <div
                            key={`${item.channel || 'channel'}-${item.accountId || 'account'}-${index}`}
                            className="rounded-xl border p-4"
                            style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                  {/* 渠道 badge */}
                                  <AppBadge variant="info">
                                    {t('binding.channelLabel')} · {item.channel || '-'}
                                  </AppBadge>
                                  {/* 账号 badge */}
                                  <AppBadge variant="success">
                                    {t('binding.accountIdLabel')} · {item.accountId || '-'}
                                  </AppBadge>
                                  {/* 账号配置状态 badge */}
                                  <AppBadge variant={item.accountConfig ? 'default' : 'neutral'}>
                                    {item.accountConfig ? '已关联账号配置' : '未找到账号配置'}
                                  </AppBadge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--app-bg)' }}>
                                    <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                                      {t('binding.bindingRules')}
                                    </div>
                                    <div className="mt-2 text-sm font-medium break-all" style={{ color: 'var(--app-text)' }}>
                                      {item.channel || '未指定通道'}
                                      {' · '}
                                      {item.accountId || '未指定账号'}
                                    </div>
                                    <div className="mt-2 text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                                      这条规则决定当前 Agent 在哪个通道下使用哪个账号运行。普通使用时，优先确认通道和账号是否匹配即可。
                                    </div>
                                  </div>
                                  <div className="rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--app-bg)' }}>
                                    <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                                      {t('binding.accountConfig')}
                                    </div>
                                    <div className="mt-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                                      {item.accountConfig ? '已配置，可直接调整' : '暂未配置，保存时会创建'}
                                    </div>
                                    <div className="mt-2 text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                                      修改入口会同时处理 binding 规则和对应的 channel account 配置，不需要你手动去找 `openclaw.json`。
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <AppButton onClick={() => openGlobalBindingEditor(index)} variant="secondary" size="sm">
                                  {t('binding.editBinding')}
                                </AppButton>
                                <AppButton
                                  onClick={() => handleDeleteBinding(index)}
                                  variant="secondary"
                                  size="sm"
                                  disabled={bindingDeleting && deletingBindingIndex === index}
                                >
                                  {bindingDeleting && deletingBindingIndex === index ? t('binding.deleting') : t('binding.deleteBinding')}
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        )) : (
                          /* 空状态展示 */
                          <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
                            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                              {t('binding.emptyState')}
                            </div>
                            <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              {t('binding.emptyStateHint')}
                            </div>
                            <div className="mt-4">
                              <AppButton onClick={openAddBindingEditor} variant="secondary" size="sm">
                                {t('binding.addBinding')}
                              </AppButton>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold">Workspace 目录</h2>
                </div>
                <div className="flex items-center gap-2">
                  <AppButton onClick={() => browseWorkspacePath()} size="sm" variant="secondary">
                    浏览目录
                  </AppButton>
                  <button
                    onClick={openTrashModal}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-token-normal cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--app-bg-elevated)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <ArchiveRestore className="w-4 h-4 mr-2" />
                    回收站
                  </button>
                </div>
              </div>
              <div className="mb-4 text-sm">
                <div style={{ color: 'var(--app-text-muted)' }}>Workspace Path</div>
                <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                  {details?.workspaceRoot || '-'}
                </code>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {details?.workspaceEntries.length ? details.workspaceEntries.map((entry) => (
                  <div
                    key={entry.path}
                    className="p-3 rounded-lg border transition-token-normal hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => openWorkspaceEntry(entry)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium" style={{ color: 'var(--app-text)' }}>{entry.name}</div>
                          <span className="text-[11px] px-2 py-1 rounded-full" style={{ backgroundColor: entry.kind === 'directory' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)', color: entry.kind === 'directory' ? '#3B82F6' : '#10B981' }}>
                            {entry.kind === 'directory' ? '目录' : '文件'}
                          </span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                          相对路径 · {entry.relativePath}
                        </div>
                        <div className="text-xs mt-1 break-all" style={{ color: 'var(--app-text-muted)' }}>
                          {entry.path}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <AppButton
                          onClick={() => openWorkspaceEntry(entry)}
                          size="sm"
                          variant="secondary"
                        >
                          {entry.kind === 'directory' ? '浏览' : '打开'}
                        </AppButton>
                        <button
                          onClick={() => handleRenameClick(entry)}
                          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-token-normal cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                          style={{
                            backgroundColor: 'var(--app-bg-elevated)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--app-text)',
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          重命名
                        </button>
                        <button
                          onClick={() => setDeletingEntry(entry)}
                          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-token-normal cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.10)',
                            border: '1px solid rgba(239, 68, 68, 0.20)',
                            color: '#EF4444',
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    当前未检测到 workspace 目录内容。
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Folder className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">智能体记忆</h2>
              </div>
              <div className="mb-4 text-sm">
                <div style={{ color: 'var(--app-text-muted)' }}>Memory Path</div>
                <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                  {details?.memoryRoot || '-'}
                </code>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {details?.memoryEntries.length ? details.memoryEntries.map((entry) => (
                  <div
                    key={entry.path}
                    className="p-3 rounded-lg border interactive-card"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => openMemoryEditor(entry.path)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="font-medium" style={{ color: 'var(--app-text)' }}>{entry.name}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                          {entry.kind} · {entry.relativePath}
                        </div>
                        <div className="text-xs mt-1 break-all" style={{ color: 'var(--app-text-muted)' }}>
                          {entry.path}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <AppButton
                          onClick={() => openMemoryEditor(entry.path)}
                          size="sm"
                          variant="secondary"
                        >
                          修改记忆
                        </AppButton>
                        <AppButton
                          onClick={async () => {
                            if (!agentId) {
                              return;
                            }

                            const shouldClear = window.confirm(`确认清空记忆文件 ${entry.name} 吗？此操作会清空文件内容。`);
                            if (!shouldClear) {
                              return;
                            }

                            setError(null);
                            setSaveMessage(null);

                            try {
                              const result = await window.electronAPI.agentsClearMemoryFile(agentId, entry.path);
                              if (!result.success || !result.file) {
                                setError(result.error || '清空智能体记忆失败');
                                return;
                              }

                              if (activeMemoryPath === entry.path) {
                                setMemoryFile(result.file);
                                setMemoryDraft(result.file.content || '');
                              }

                              setSaveMessage(`${entry.name} 已清空`);
                              await loadWorkspace();
                            } catch (memoryError) {
                              setError(`清空智能体记忆时发生异常: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
                            }
                          }}
                          size="sm"
                          variant="danger"
                        >
                          清除记忆
                        </AppButton>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    当前未检测到智能体记忆目录内容。
                  </div>
                )}
              </div>
            </GlassCard>

            {/* ── 当前智能体配置（含 Config + Sessions 浏览，跨满所有列） ── */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">当前智能体配置</h2>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Agent Config Path</div>
                      <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                        {details?.agentConfigRoot || '未检测到 sessions 目录'}
                      </code>
                    </div>
                    <AppButton onClick={() => setEntryBrowserOpen('config')} variant="secondary" size="sm">
                      浏览配置
                    </AppButton>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-auto pr-1">
                    {details?.agentConfigEntries.length ? details.agentConfigEntries.map((entry) => (
                      <button
                        key={entry.path}
                        onClick={() => openManagedFile(entry.path)}
                        className="rounded-xl border p-4 interactive-card text-left w-full"
                        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate" style={{ color: 'var(--app-text)' }}>{entry.name}</div>
                            <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                              {getEntryKindLabel(entry)} · {entry.relativePath}
                            </div>
                          </div>
                          <span className="text-[11px] px-2 py-1 rounded-full" style={{ backgroundColor: entry.kind === 'directory' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)', color: entry.kind === 'directory' ? '#3B82F6' : '#10B981' }}>
                            {entry.kind === 'directory' ? '目录' : '文件'}
                          </span>
                        </div>
                        <div className="text-xs mt-3 truncate" style={{ color: 'var(--app-text-muted)' }} title={entry.path}>
                          {entry.path}
                        </div>
                      </button>
                    )) : (
                      <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                        当前未检测到 agent 配置目录内容。
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Sessions Path</div>
                      <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                        {details?.sessionsRoot || '未检测到 sessions 目录'}
                      </code>
                    </div>
                    <AppButton onClick={() => setEntryBrowserOpen('sessions')} variant="secondary" size="sm">
                      浏览会话
                    </AppButton>
                  </div>
                  <div className="mt-4 space-y-3 max-h-64 overflow-auto pr-1">
                    {details?.sessionEntries.length ? details.sessionEntries.map((entry) => (
                      <button
                        key={entry.path}
                        onClick={() => openManagedFile(entry.path)}
                        className="rounded-xl border p-4 interactive-card text-left w-full"
                        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate" style={{ color: 'var(--app-text)' }} title={entry.name}>{entry.name}</div>
                            <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                              {getEntryKindLabel(entry)} · {entry.relativePath}
                            </div>
                            <div className="text-xs mt-2 truncate" style={{ color: 'var(--app-text-muted)' }} title={entry.path}>
                              {entry.path}
                            </div>
                          </div>
                          <div className="shrink-0 self-start">
                            {/* 文件类型 badge */}
                            <AppBadge
                              size="sm"
                              variant={
                                entry.name === 'sessions.json' ? 'info'
                                : entry.name.endsWith('.jsonl') ? 'default'
                                : 'neutral'
                              }
                            >
                              {entry.name === 'sessions.json' ? '会话索引' : entry.name.endsWith('.jsonl') ? '会话日志' : entry.kind === 'directory' ? '目录' : '文件'}
                            </AppBadge>
                          </div>
                        </div>
                      </button>
                    )) : (
                      <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                        当前未检测到 sessions 目录内容。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* ── 专属技能 ── */}
            <GlassCard className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => {
                  const next = !skillsPanelOpen;
                  setSkillsPanelOpen(next);
                  // 展开时按需加载技能数据
                  if (next && !agentSkills) {
                    loadAgentSkills();
                    loadAllSkills();
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5" style={{ color: '#EC4899' }} />
                  <h2 className="text-lg font-semibold">专属技能</h2>
                  {agentSkills && (
                    <AppBadge variant="neutral" size="sm">
                      {agentSkills.exclusiveSkills.length}
                    </AppBadge>
                  )}
                </div>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${skillsPanelOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--app-text-muted)', transitionDuration: 'var(--transition-normal)' }}
                />
              </div>
              {/* 展开时渲染技能面板 */}
              {skillsPanelOpen && (
                <div className="mt-4">
                  <AgentSkillsPanel
                    agentId={agentId!}
                    agentName={details?.agent.name || agentId || ''}
                    agentSkills={agentSkills}
                    loading={loadingSkills}
                    onRefresh={() => {
                      loadAgentSkills();
                    }}
                    onAddExclusiveSkill={async (skillId) => {
                      const result = await window.electronAPI.skillsBindToAgents(skillId, [agentId!]);
                      if (result.success) {
                        loadAgentSkills(); // 刷新技能列表
                      }
                      return result;
                    }}
                    onUnbindSkill={async (skillId) => {
                      const result = await window.electronAPI.skillsUnbindFromAgents(skillId, [agentId!]);
                      if (result.success) {
                        loadAgentSkills(); // 刷新技能列表
                      }
                      return result;
                    }}
                    allSkills={allSkills}
                  />
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Folder className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold">配置来源</h2>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div style={{ color: 'var(--app-text-muted)' }}>Workspace Root</div>
                  <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                    {details?.workspaceRoot || '-'}
                  </code>
                </div>
                <div>
                  <div style={{ color: 'var(--app-text-muted)' }}>智能体配置根目录</div>
                  <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                    {details?.agentConfigRoot || '-'}
                  </code>
                </div>
                <div>
                  <div style={{ color: 'var(--app-text-muted)' }}>Config Source</div>
                  <div className="mt-1" style={{ color: 'var(--app-text)' }}>
                    {details?.agent.configSource || '-'}
                  </div>
                </div>
              </div>
            </GlassCard>

        </div>
      </div>

      {/* ── 文件编辑器 modal ─────────────────────────────────────────────── */}
      <AppModal
        open={editorOpen}
        onClose={closeEditor}
        size="2xl"
        noPadding
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <span>{activeFile}</span>
            {/* 文件存在状态 pill */}
            <span className="text-xs px-2 py-1 rounded-full" style={{
              backgroundColor: currentSummary?.exists ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              color: currentSummary?.exists ? 'var(--color-success, #10B981)' : 'var(--color-info, #3B82F6)',
            }}>
              {currentSummary?.exists ? '已存在' : '待创建'}
            </span>
            {/* 未保存修改 pill */}
            {isDirty && (
              <span className="text-xs px-2 py-1 rounded-full" style={{
                backgroundColor: 'rgba(245, 158, 11, 0.14)',
                color: 'var(--color-warning, #F59E0B)',
              }}>
                未保存修改
              </span>
            )}
          </div>
        }
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {isDirty ? '你有未保存的修改' : '当前内容已同步到本地'}
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={closeEditor} variant="secondary">取消</AppButton>
              <AppButton
                onClick={handleSave}
                disabled={saving || fileLoading}
                loading={saving}
                icon={<Save className="w-4 h-4" />}
                variant={isDirty ? 'primary' : 'success'}
              >
                {isDirty ? '保存变更' : '已保存'}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {/* 文件元信息 */}
        <div className="px-6 pt-1 pb-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          <div className="break-all">{currentSummary?.path || '等待读取文件路径'}</div>
          <div className="mt-1 flex flex-wrap gap-4">
            <span>大小：{formatBytes(currentSummary?.size || 0)}</span>
            <span>更新时间：{formatTimestamp(currentSummary?.updatedAt)}</span>
          </div>
        </div>
        {/* 提示栏 */}
        <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          推荐：修改完成后先保存，再根据内容变更决定是否点击页面右上角的 `重启 Gateway`。
        </div>
        {/* 编辑区 */}
        <div className="p-6">
          <textarea
            value={currentDraft}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDrafts((current) => ({ ...current, [activeFile]: nextValue }));
            }}
            spellCheck={false}
            className="w-full min-h-[56vh] rounded-2xl p-5 font-mono text-sm outline-none resize-y"
            style={{
              backgroundColor: 'var(--app-bg)',
              color: 'var(--app-text)',
              border: '1px solid var(--app-border)',
            }}
          />
          {fileLoading && (
            <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在加载文件内容...</div>
          )}
        </div>
      </AppModal>

      {/* ── Skills 原始配置只读预览 modal ────────────────────────────────── */}
      <AppModal
        open={skillsConfigPreviewOpen}
        onClose={() => setSkillsConfigPreviewOpen(false)}
        size="2xl"
        noPadding
        className="z-[60]"
        title="Skills 原始配置"
      >
        {/* 副标题说明 */}
        <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          基于全局配置中当前 Agent 对应的 Skills 相关片段生成，只读预览。
        </div>
        {/* 只读预览区 */}
        <div className="p-6 overflow-auto" style={{ maxHeight: '70vh' }}>
          <pre
            className="w-full rounded-2xl p-5 text-sm font-mono whitespace-pre-wrap break-words"
            style={{
              backgroundColor: 'var(--app-bg)',
              color: 'var(--app-text)',
              border: '1px solid var(--app-border)',
            }}
          >
            {skillsConfigPreview}
          </pre>
        </div>
      </AppModal>

      {/* ── 编辑全局 Agent 配置 modal ─────────────────────────────────────── */}
      <AppModal
        open={globalAgentConfigOpen}
        onClose={() => setGlobalAgentConfigOpen(false)}
        size="2xl"
        noPadding
        className="z-[60]"
        title="编辑全局 Agent 配置"
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              这里编辑的是全局核心配置，不是派生的 `models.json` / `auth-profiles.json`。
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={() => setGlobalAgentConfigOpen(false)} variant="secondary">取消</AppButton>
              <AppButton
                onClick={handleSaveGlobalAgentConfig}
                disabled={globalAgentConfigSaving}
                icon={<Save className="w-4 h-4" />}
              >
                {globalAgentConfigSaving ? '保存中...' : '保存全局配置'}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {/* 副标题说明 */}
        <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          直接修改 `openclaw.json` 中当前 Agent 对应的 `agents.list[]` 条目。保存后建议重启 Gateway，让派生配置重新生成。
        </div>
        {/* JSON 表单编辑器 */}
        <div style={{ height: '62vh' }}>
          <JsonFormEditor
            emptyText="当前全局 Agent 配置没有可展示的顶层分组。"
            onChange={setGlobalAgentConfigDraft}
            rawPreviewTitle="全局 Agent 原始配置"
            showRawPreview
            tabs={globalAgentConfigTabs}
            value={globalAgentConfigDraft || {}}
          />
        </div>
      </AppModal>

      {/* ── 绑定配置编辑器 modal ──────────────────────────────────────────── */}
      <AppModal
        open={!!globalBindingEditor}
        onClose={closeGlobalBindingEditor}
        size="2xl"
        noPadding
        className="z-[60]"
        title={
          <div className="flex flex-col gap-2">
            <span>{globalBindingEditor?.mode === 'add' ? t('binding.addBinding') : t('binding.editBinding')}</span>
            {/* 通道 / 账号 badge 标签 */}
            <div className="flex flex-wrap gap-2">
              <AppBadge variant="info">
                {t('binding.channelLabel')} · {globalBindingEditor?.channel || '-'}
              </AppBadge>
              <AppBadge variant="success">
                {t('binding.accountIdLabel')} · {globalBindingEditor?.accountId || '-'}
              </AppBadge>
            </div>
          </div>
        }
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              保存后会直接更新全局配置文件，重启 Gateway 后生效。
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={closeGlobalBindingEditor} variant="secondary">{t('common.cancel')}</AppButton>
              <AppButton
                onClick={handleSaveGlobalBindingConfig}
                disabled={globalBindingSaving}
                icon={<Save className="w-4 h-4" />}
              >
                {globalBindingSaving ? t('binding.saving') : t('common.save')}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {/* 副标题说明 */}
        <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          配置当前 Agent 的消息路由规则：选择通道和账号，决定哪些消息会被路由到此 Agent。
        </div>
        {/* JSON 表单编辑器 */}
        <div style={{ height: '62vh' }}>
          <JsonFormEditor
            emptyText="当前没有可展示的 binding 配置分组。"
            onChange={setGlobalBindingDraft}
            rawPreviewTitle="Channel / Binding 原始配置"
            schema={globalBindingSchema}
            showRawPreview
            tabs={globalBindingTabs}
            value={globalBindingDraft || {}}
          />
        </div>
      </AppModal>

      {/* ── 事件详情 modal ────────────────────────────────────────────────── */}
      <AppModal
        open={managedFileOpen && !!selectedSessionEvent}
        onClose={() => setSelectedSessionEvent(null)}
        size="xl"
        noPadding
        className="z-[60]"
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <span>事件详情</span>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
              {selectedSessionEvent?.type || '事件'}
            </span>
          </div>
        }
      >
        {/* 时间 / 角色元信息 */}
        <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          {formatTimestamp(selectedSessionEvent?.timestamp)}
          {selectedSessionEvent?.role ? ` · ${selectedSessionEvent.role}` : ''}
        </div>
        {/* 事件内容 */}
        <div className="p-6 space-y-4 overflow-auto" style={{ maxHeight: '65vh' }}>
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
            <div className="text-sm font-medium mb-2">可读详情</div>
            <div className="text-sm whitespace-pre-wrap break-words leading-6" style={{ color: 'var(--app-text)' }}>
              {selectedSessionEvent?.detail || '暂无详情'}
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
            <div className="text-sm font-medium mb-2">原始事件 JSON</div>
            <pre className="text-xs whitespace-pre-wrap break-words font-mono" style={{ color: 'var(--app-text-muted)' }}>
              {JSON.stringify(selectedSessionEvent?.raw, null, 2)}
            </pre>
          </div>
        </div>
      </AppModal>

      {/* ── 文件浏览器 modal ──────────────────────────────────────────────── */}
      <AppModal
        open={!!entryBrowserOpen}
        onClose={closeEntryBrowser}
        size="2xl"
        noPadding
        title={
          <div className="flex items-center gap-3">
            <span>
              {entryBrowserOpen === 'workspace' ? '浏览 Workspace'
                : entryBrowserOpen === 'config' ? '浏览 Agent 配置'
                : '浏览 Sessions'}
            </span>
            {/* 返回上级按钮（仅 workspace 模式） */}
            {entryBrowserOpen === 'workspace' && workspaceCanGoUp && workspaceParentPath && (
              <AppButton onClick={() => browseWorkspacePath(workspaceParentPath)} size="sm" variant="secondary">
                返回上级
              </AppButton>
            )}
          </div>
        }
      >
        {/* 当前路径信息栏 */}
        <div className="px-6 py-3 border-b text-sm break-all" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          {entryBrowserOpen === 'workspace'
            ? workspaceBrowse?.currentPath || details?.workspaceRoot
            : entryBrowserOpen === 'config'
              ? details?.agentConfigRoot
              : details?.sessionsRoot}
        </div>
        {/* 路径 + 条目数统计栏 */}
        <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>当前路径</div>
              <div className="mt-1 text-sm break-all" style={{ color: 'var(--app-text)' }}>
                {entryBrowserOpen === 'workspace'
                  ? workspaceBrowse?.currentPath || details?.workspaceRoot
                  : entryBrowserOpen === 'config'
                    ? details?.agentConfigRoot
                    : details?.sessionsRoot}
              </div>
            </div>
            <div className="shrink-0 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {entryBrowserOpen === 'workspace'
                ? `${workspaceBrowse?.entries.length || 0} 个条目`
                : entryBrowserOpen === 'sessions'
                  ? `${details?.sessionEntries.length || 0} 个条目`
                  : `${details?.agentConfigEntries.length || 0} 个条目`}
            </div>
          </div>
        </div>
        {/* 条目列表 */}
        <div className="p-6 overflow-hidden" style={{ height: '60vh' }}>
          {entryBrowserOpen === 'workspace' ? (
            <AppTable
              className="h-full"
              stickyHeader
              rows={workspaceBrowse?.entries || []}
              columns={[
                {
                  key: 'name',
                  label: '名称',
                  width: '320px',
                  render: (entry) => (
                    <div className="min-w-0 flex items-center gap-3">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                        style={{
                          backgroundColor: entry.kind === 'directory' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: entry.kind === 'directory' ? '#60A5FA' : '#34D399',
                          border: entry.kind === 'directory' ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid rgba(16, 185, 129, 0.18)',
                        }}
                      >
                        {entry.kind === 'directory' ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={entry.name}>{entry.name}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--app-table-cell-muted-text)' }}>
                          {entry.kind === 'directory' ? '文件夹' : '文件内容'}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'kind',
                  label: '类型',
                  width: '120px',
                  nowrap: true,
                  render: (entry) => (
                    /* 目录/文件类型 badge */
                    <AppBadge
                      size="sm"
                      variant={entry.kind === 'directory' ? 'info' : 'success'}
                    >
                      {entry.kind === 'directory' ? '目录' : '文件'}
                    </AppBadge>
                  ),
                },
                {
                  key: 'relativePath',
                  label: '相对路径',
                  lineClamp: 2,
                  render: (entry) => (
                    <span title={entry.relativePath} style={{ color: 'var(--app-table-cell-muted-text)' }}>
                      {entry.relativePath}
                    </span>
                  ),
                },
                {
                  key: 'action',
                  label: '操作',
                  width: '104px',
                  align: 'right',
                  nowrap: true,
                  render: (entry) => (
                    <div className="flex justify-end">
                      <AppButton onClick={() => openWorkspaceEntry(entry)} variant="secondary" size="sm">
                        {entry.kind === 'directory' ? '浏览' : '打开'}
                      </AppButton>
                    </div>
                  ),
                },
              ]}
              emptyText="当前目录下没有可展示的 Workspace 条目"
            />
          ) : entryBrowserOpen === 'sessions' ? (
            <AppTable
              className="h-full"
              stickyHeader
              rows={details?.sessionEntries || []}
              columns={[
                {
                  key: 'name',
                  label: '名称',
                  width: '260px',
                  truncate: true,
                  render: (entry) => (
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={entry.name}>{entry.name}</div>
                    </div>
                  ),
                },
                {
                  key: 'kind',
                  label: '类型',
                  width: '120px',
                  nowrap: true,
                  render: (entry) => (
                    <span style={{ color: 'var(--app-table-cell-muted-text)' }}>{getEntryKindLabel(entry)}</span>
                  ),
                },
                {
                  key: 'relativePath',
                  label: '相对路径',
                  lineClamp: 2,
                  render: (entry) => (
                    <span title={entry.relativePath} style={{ color: 'var(--app-table-cell-muted-text)' }}>
                      {entry.relativePath}
                    </span>
                  ),
                },
                {
                  key: 'action',
                  label: '操作',
                  width: '104px',
                  align: 'right',
                  nowrap: true,
                  render: (entry) => (
                    <div className="flex justify-end">
                      <AppButton onClick={() => openManagedFile(entry.path)} variant="secondary" size="sm">打开</AppButton>
                    </div>
                  ),
                },
              ]}
              emptyText="当前未检测到 Sessions 条目"
            />
          ) : (
            <div className="h-full overflow-auto space-y-3">
              {(details?.agentConfigEntries || []).map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => openManagedFile(entry.path)}
                  className="w-full rounded-2xl border p-4 interactive-card text-left"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{entry.name}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                        {getEntryKindLabel(entry)} · {entry.relativePath}
                      </div>
                      <div className="text-xs mt-2 truncate" style={{ color: 'var(--app-text-muted)' }} title={entry.path}>
                        {entry.path}
                      </div>
                    </div>
                    <AppButton variant="secondary" size="sm">打开</AppButton>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppModal>

      {/* ── 模型配置编辑器 modal ──────────────────────────────────────────── */}
      <AppModal
        open={globalModelEditorOpen}
        onClose={closeGlobalModelEditor}
        size="lg"
        className="z-[60]"
        title="编辑模型配置"
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              保存后会直接更新当前 Agent 在 `openclaw.json` 中的 `agents.list[]` 条目。
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={closeGlobalModelEditor} variant="secondary">取消</AppButton>
              <AppButton
                onClick={handleSaveGlobalModelConfig}
                disabled={globalModelSaving}
                icon={<Save className="w-4 h-4" />}
              >
                {globalModelSaving ? '保存中...' : '保存模型配置'}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {/* 副标题说明 */}
        <div className="-mt-2 mb-4 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
          你可以为当前 Agent 切换主模型，并设置备选模型列表。模型选项来自 `openclaw.json` 中的模型注册表。
        </div>
        {/* 主模型选择 */}
        <div className="space-y-2 mb-4">
          <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>当前模型</div>
          <AppSelect
            options={globalModelSelectOptions}
            placeholder="请选择主模型"
            searchPlaceholder="搜索主模型"
            size="sm"
            value={globalModelEditor.primary}
            onChange={(nextValue) => {
              const nextPrimary = Array.isArray(nextValue) ? '' : nextValue;
              setGlobalModelEditor((current) => ({
                ...current,
                primary: nextPrimary,
                fallbacks: current.fallbacks.filter((item) => item !== nextPrimary),
              }));
            }}
          />
        </div>
        {/* 备选模型选择 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>备选模型</div>
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              可多选；保存时会自动创建 `fallbacks` 数组
            </div>
          </div>
          <AppSelect
            emptyText="没有匹配的备选模型。"
            multiple
            options={globalModelSelectOptions.filter((option) => option.value !== globalModelEditor.primary)}
            placeholder="请选择备选模型"
            searchPlaceholder="搜索备选模型"
            size="sm"
            value={globalModelEditor.fallbacks}
            onChange={(nextValue) => {
              setGlobalModelEditor((current) => ({
                ...current,
                fallbacks: Array.isArray(nextValue) ? nextValue : [],
              }));
            }}
          />
          {/* 已选备选模型列表 */}
          {globalModelEditor.fallbacks.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {globalModelEditor.fallbacks.map((fallback) => (
                <div
                  key={fallback}
                  className="rounded-xl border px-3.5 py-3"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                        {globalModelOptionMap[fallback] || fallback}
                      </div>
                      <div className="mt-1 text-xs break-all" style={{ color: 'var(--app-text-muted)' }}>
                        {fallback}
                      </div>
                    </div>
                    {/* 已选备选模型标记 badge */}
                    <AppBadge variant="neutral" size="sm">已选</AppBadge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              当前未选择备选模型，保存后会写入空的 `fallbacks: []`。
            </div>
          )}
        </div>
      </AppModal>

      {/* ── 文件内容编辑器 modal（JSON / 文本 / 会话日志） ─────────────────── */}
      <AppModal
        open={managedFileOpen && !!managedFile}
        onClose={closeManagedFile}
        size="2xl"
        noPadding
        title={
          managedFile ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span>{managedFile.name}</span>
              {/* 文件类型 pill */}
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--color-success, #10B981)' }}>
                {isManagedSessionLog ? '会话日志' : isManagedJson ? '动态表单' : '文本内容'}
              </span>
              {/* 未保存修改 pill */}
              {isManagedDirty && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', color: 'var(--color-warning, #F59E0B)' }}>
                  未保存修改
                </span>
              )}
            </div>
          ) : null
        }
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {isManagedDirty ? '你有未保存的修改' : '当前内容已同步到本地'}
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={closeManagedFile} variant="secondary">关闭</AppButton>
              <AppButton
                onClick={handleSaveManagedFile}
                disabled={managedSaving || managedLoading}
                icon={<Save className="w-4 h-4" />}
                variant={isManagedDirty ? 'primary' : 'success'}
              >
                {managedSaving ? '保存中...' : isManagedDirty ? '保存修改' : '已保存'}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {managedFile && (
          <>
            {/* 文件元信息 */}
            <div className="px-6 pt-1 pb-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              <div className="break-all">{managedFile.path}</div>
              <div className="mt-1 flex flex-wrap gap-4">
                <span>大小：{formatBytes(managedFile.size || 0)}</span>
                <span>更新时间：{formatTimestamp(managedFile.updatedAt)}</span>
              </div>
            </div>
            {/* 工具栏：说明文字 + 视图切换（会话日志模式） */}
            <div className="px-6 py-3 border-b text-sm flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              <div className="min-w-0">
                {isManagedSessionLog
                  ? '会话日志已支持会话视图、事件表格和原始文本三种模式切换。'
                  : isManagedJson
                  ? 'JSON 配置采用分组编辑，只有真正改动内容后才会提示未保存。'
                  : '文本内容按原始文本方式编辑，保存前不会改动文件。'}
              </div>
              {isManagedSessionLog ? (
                /* 会话日志视图切换按钮组 */
                <div className="flex items-center gap-2 shrink-0">
                  {([
                    { key: 'conversation', label: '会话视图' },
                    { key: 'table', label: '事件表格' },
                    { key: 'raw', label: '原始文本' },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setManagedViewMode(item.key)}
                      className="px-3 py-2 rounded-lg text-xs font-medium transition-token-normal"
                      style={managedViewMode === item.key
                        ? { background: 'var(--app-selected-card-bg)', border: '1px solid var(--app-selected-card-border)', color: 'var(--app-text)', boxShadow: 'var(--app-selected-card-shadow)' }
                        : { backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : isManagedJson && (
                <div className="text-xs shrink-0" style={{ color: 'var(--app-text-muted)' }}>
                  分组数：{Object.keys(managedJsonDraft).length}
                </div>
              )}
            </div>
            {/* 内容区 */}
            <div style={{ height: '60vh', overflow: 'hidden' }}>
              {isManagedSessionLog && managedViewMode !== 'raw' ? (
                <div className="h-full min-h-0 overflow-auto p-6">
                  {managedViewMode === 'conversation' ? (
                    /* 会话视图 */
                    <div className="space-y-3 pb-6">
                      {managedSessionEvents.map((event, index) => {
                        const tone = getSessionEventTone(event);
                        const messageText = event.type === 'message'
                          ? String(event.raw?.message?.content?.text || event.raw?.message?.content || event.summary || '')
                          : event.summary;
                        return (
                          <div
                            key={`${event.id || event.timestamp || event.type || 'event'}-${index}`}
                            className="rounded-xl border p-4"
                            style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              {/* 会话事件类型 badge：tone 提供动态颜色 */}
                              <AppBadge
                                size="sm"
                                style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                              >
                                {tone.label}
                              </AppBadge>
                              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                                {formatTimestamp(event.timestamp)}
                              </span>
                            </div>
                            <div className="text-sm leading-6 whitespace-pre-wrap break-words" style={{ color: 'var(--app-text)' }}>
                              {messageText || '暂无内容'}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              <span>类型：{event.type || '-'}</span>
                              {event.role && <span>角色：{event.role}</span>}
                              {event.parentId && <span>父事件：{event.parentId}</span>}
                              <button
                                onClick={() => setSelectedSessionEvent(event)}
                                className="px-2.5 py-1 rounded-lg border transition-token-normal"
                                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                              >
                                查看详情
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* 事件表格视图 */
                    <AppTable
                      className="max-h-full"
                      rows={managedSessionEvents}
                      stickyHeader
                      columns={[
                        { key: 'type', label: '类型', width: '120px', render: (event) => <span className="truncate block">{event.type || '-'}</span> },
                        { key: 'timestamp', label: '时间', width: '180px', render: (event) => <span className="truncate block" style={{ color: 'var(--app-text-muted)' }}>{formatTimestamp(event.timestamp)}</span> },
                        { key: 'role', label: '角色', width: '100px', render: (event) => <span className="truncate block" style={{ color: 'var(--app-text-muted)' }}>{event.role || '-'}</span> },
                        { key: 'summary', label: '摘要', cellClassName: 'min-w-0', render: (event) => <span className="line-clamp-2 block leading-6" title={event.detail}>{event.summary || '-'}</span> },
                        {
                          key: 'action', label: '详情', width: '104px', align: 'right',
                          render: (event) => (
                            <div className="flex justify-end">
                              <AppButton onClick={() => setSelectedSessionEvent(event)} size="sm" variant="secondary">查看</AppButton>
                            </div>
                          ),
                        },
                      ]}
                      emptyText="当前没有可展示的会话事件"
                    />
                  )}
                </div>
              ) : isManagedJson && managedJsonDraft !== null ? (
                /* JSON 动态表单编辑器 */
                <JsonFormEditor
                  emptyText="当前 JSON 没有可展示的顶层分组。"
                  onChange={setManagedJsonDraft}
                  rawPreviewTitle={`${managedFile?.name || '配置文件'} 原始配置`}
                  showRawPreview
                  tabs={getTopLevelSections(managedJsonDraft).map((section) => ({ key: section, label: section }))}
                  value={managedJsonDraft}
                />
              ) : (
                /* 纯文本编辑器 */
                <div className="h-full min-h-0 p-6 overflow-auto">
                  <textarea
                    value={managedDraft}
                    onChange={(event) => setManagedDraft(event.target.value)}
                    spellCheck={false}
                    className="w-full min-h-[60vh] rounded-2xl p-5 font-mono text-sm outline-none resize-y"
                    style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  />
                </div>
              )}
              {/* 加载提示 */}
              {managedLoading && (
                <div className="px-6 pb-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在加载内容...</div>
              )}
            </div>
          </>
        )}
      </AppModal>

      {/* ── 记忆文件编辑器 modal ──────────────────────────────────────────── */}
      <AppModal
        open={memoryEditorOpen && !!memoryFile}
        onClose={closeMemoryEditor}
        size="2xl"
        noPadding
        title={
          memoryFile ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span>{memoryFile.name}</span>
              {/* 记忆文件类型 pill */}
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--color-success, #10B981)' }}>
                记忆文件
              </span>
              {/* 未保存修改 pill */}
              {isMemoryDirty && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', color: 'var(--color-warning, #F59E0B)' }}>
                  未保存修改
                </span>
              )}
            </div>
          ) : null
        }
        footer={
          <>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {isMemoryDirty ? '你有未保存的记忆修改' : '当前记忆内容已同步到本地'}
            </div>
            <div className="flex items-center gap-3">
              <AppButton onClick={handleClearMemory} disabled={memorySaving || memoryClearing} variant="danger">
                {memoryClearing ? '清空中...' : '清除记忆'}
              </AppButton>
              <AppButton onClick={closeMemoryEditor} variant="secondary">关闭</AppButton>
              <AppButton
                onClick={handleSaveMemory}
                disabled={memorySaving || memoryClearing}
                icon={<Save className="w-4 h-4" />}
                variant={isMemoryDirty ? 'primary' : 'success'}
              >
                {memorySaving ? '保存中...' : isMemoryDirty ? '保存修改' : '已保存'}
              </AppButton>
            </div>
          </>
        }
        footerJustify="between"
      >
        {memoryFile && (
          <>
            {/* 文件元信息 */}
            <div className="px-6 pt-1 pb-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              <div className="break-all">{memoryFile.path}</div>
              <div className="mt-1 flex flex-wrap gap-4">
                <span>大小：{formatBytes(memoryFile.size || 0)}</span>
                <span>更新时间：{formatTimestamp(memoryFile.updatedAt)}</span>
              </div>
            </div>
            {/* 操作说明 */}
            <div className="px-6 py-3 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              你可以在这里查看、修改或清空智能体记忆内容。关闭前若存在未保存修改，会提示确认。
            </div>
            {/* 编辑区 */}
            <div className="p-6">
              <textarea
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                spellCheck={false}
                className="w-full min-h-[52vh] rounded-2xl p-5 font-mono text-sm outline-none resize-y"
                style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
              />
              {memoryLoading && (
                <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在加载记忆内容...</div>
              )}
            </div>
          </>
        )}
      </AppModal>

      {/* ── 重命名对话框 modal ────────────────────────────────────────────── */}
      <AppModal
        open={!!renamingEntry}
        onClose={() => setRenamingEntry(null)}
        size="md"
        title={renamingEntry ? `重命名：${renamingEntry.name}` : '重命名'}
        footer={
          <>
            <AppButton onClick={() => setRenamingEntry(null)} variant="secondary">取消</AppButton>
            <AppButton
              onClick={handleRenameSubmit}
              disabled={renameSaving || !renameValue.trim()}
            >
              {renameSaving ? '保存中...' : '确认重命名'}
            </AppButton>
          </>
        }
      >
        {/* 说明文字 */}
        <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          只修改当前层级名称，不会移动到别的目录。
        </div>
        {/* 重命名输入框 */}
        <input
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
        />
      </AppModal>

      {/* ── 删除确认 modal ────────────────────────────────────────────────── */}
      <AppModal
        open={!!deletingEntry}
        onClose={() => setDeletingEntry(null)}
        size="md"
        variant="danger"
        title="安全删除确认"
        footer={
          <>
            <AppButton onClick={() => setDeletingEntry(null)} variant="secondary">取消</AppButton>
            <AppButton onClick={handleDeleteSubmit} disabled={deleteSaving} variant="danger">
              {deleteSaving ? '移动中...' : '移入回收站'}
            </AppButton>
          </>
        }
      >
        {/* 说明文字 */}
        <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          删除不会直接移除，而是放入回收站，可稍后恢复。
        </div>
        {/* 待删除条目信息卡 */}
        {deletingEntry && (
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
            <div className="font-semibold">{deletingEntry.name}</div>
            <div className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
              {deletingEntry.kind === 'directory' ? '目录' : '文件'} · {deletingEntry.relativePath}
            </div>
            <div className="text-xs mt-2 break-all" style={{ color: 'var(--app-text-muted)' }}>
              {deletingEntry.path}
            </div>
          </div>
        )}
      </AppModal>

      {/* ── 回收站 modal ──────────────────────────────────────────────────── */}
      <AppModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        size="2xl"
        noPadding
        title={
          <div className="flex items-center gap-3">
            <span>Workspace 回收站</span>
            {/* 刷新按钮放在标题区右侧 */}
            <AppButton
              onClick={loadTrashEntries}
              loading={trashLoading}
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="w-4 h-4" />}
            >
              刷新
            </AppButton>
          </div>
        }
      >
        {/* 回收站路径 */}
        <div className="px-6 py-3 border-b text-sm break-all" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
          {trashRoot || '回收站路径加载中'}
        </div>
        {/* 批量操作工具栏 */}
        <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              已选择 {selectedTrashEntryIds.length} / {trashEntries.length} 个条目
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 全选 / 取消全选 */}
              <AppButton
                onClick={handleSelectAllTrashEntries}
                disabled={!trashEntries.length}
                size="sm"
                variant="secondary"
              >
                {selectedTrashEntryIds.length === trashEntries.length && trashEntries.length ? '取消全选' : '全选'}
              </AppButton>
              {/* 批量恢复 */}
              <AppButton
                onClick={handleRestoreSelectedTrashEntries}
                disabled={!selectedTrashEntryIds.length || trashBatchAction !== null}
                size="sm"
                variant="secondary"
                icon={<ArchiveRestore className="w-4 h-4" />}
              >
                {trashBatchAction === 'restore' ? '批量恢复中...' : '批量恢复'}
              </AppButton>
              {/* 批量永久删除 */}
              <AppButton
                onClick={handleDeleteSelectedTrashEntries}
                disabled={!selectedTrashEntryIds.length || trashBatchAction !== null}
                size="sm"
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
              >
                {trashBatchAction === 'delete' ? '批量删除中...' : '批量永久删除'}
              </AppButton>
              {/* 一键清空 */}
              <AppButton
                onClick={handleClearTrash}
                disabled={!trashEntries.length || trashBatchAction !== null}
                size="sm"
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
              >
                {trashBatchAction === 'clear' ? '清空中...' : '一键清空回收站'}
              </AppButton>
            </div>
          </div>
        </div>
        {/* 回收站条目列表 */}
        <div className="p-6 overflow-auto" style={{ maxHeight: '60vh' }}>
          <div className="space-y-3">
            {trashEntries.length ? trashEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border p-4"
                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* 复选框 */}
                  <label className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedTrashEntryIds.includes(entry.id)}
                      onChange={() => toggleTrashEntrySelection(entry.id)}
                      className="h-4 w-4"
                    />
                  </label>
                  {/* 条目信息 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold">{entry.name}</div>
                      {/* 类型 pill */}
                      <span
                        className="text-[11px] px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: entry.kind === 'directory' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)',
                          color: entry.kind === 'directory' ? '#3B82F6' : '#10B981',
                        }}
                      >
                        {entry.kind === 'directory' ? '目录' : '文件'}
                      </span>
                    </div>
                    <div className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
                      删除时间 · {formatTimestamp(entry.deletedAt)}
                    </div>
                    <div className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
                      原始位置 · {entry.originalRelativePath}
                    </div>
                    <div className="text-xs mt-2 break-all" style={{ color: 'var(--app-text-muted)' }}>
                      回收站位置 · {entry.path}
                    </div>
                  </div>
                  {/* 单条恢复按钮 */}
                  <div className="flex items-center gap-2">
                    <AppButton
                      onClick={() => handleRestoreTrashEntry(entry.id)}
                      disabled={trashRestoringId === entry.id || trashBatchAction !== null}
                      size="sm"
                      variant="secondary"
                      icon={<ArchiveRestore className="w-4 h-4" />}
                    >
                      {trashRestoringId === entry.id ? '恢复中...' : '恢复'}
                    </AppButton>
                  </div>
                </div>
              </div>
            )) : (
              /* 空状态 */
              <div className="rounded-2xl border p-6 text-sm" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                {trashLoading ? '正在加载回收站...' : '回收站当前为空。'}
              </div>
            )}
          </div>
        </div>
      </AppModal>
    </div>
  );
};

export default AgentWorkspace;
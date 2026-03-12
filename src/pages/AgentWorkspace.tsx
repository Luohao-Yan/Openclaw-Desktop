import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  CheckCircle2,
  FileText,
  Folder,
  Info,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AgentGlobalConfigOverview,
  AgentManagedFileDetail,
  AgentWorkspaceBrowseResult,
  AgentWorkspaceDetails,
  AgentWorkspaceEntry,
  AgentWorkspaceFileDetail,
  AgentWorkspaceFileName,
  AgentMemoryFileDetail,
  AgentWorkspaceFileSummary,
  AgentWorkspaceTrashEntry,
} from '../../types/electron';
import AppButton from '../components/AppButton';
import AppTable from '../components/AppTable';
import GlassCard from '../components/GlassCard';

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

type GlobalBindingEditorState = {
  index: number;
  channel?: string;
  accountId?: string;
  binding: any;
  accountConfig?: any;
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

const updateJsonValueByPath = (source: any, path: Array<string | number>, nextValue: string) => {
  const nextSource = Array.isArray(source) ? [...source] : { ...source };
  let cursor = nextSource;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextCursor = cursor[key];
    cursor[key] = Array.isArray(nextCursor) ? [...nextCursor] : { ...nextCursor };
    cursor = cursor[key];
  }

  const leafKey = path[path.length - 1];
  const currentValue = cursor[leafKey];

  if (typeof currentValue === 'number') {
    cursor[leafKey] = Number(nextValue);
  } else if (typeof currentValue === 'boolean') {
    cursor[leafKey] = nextValue === 'true';
  } else if (currentValue === null) {
    cursor[leafKey] = nextValue === '' ? null : nextValue;
  } else {
    cursor[leafKey] = nextValue;
  }

  return nextSource;
};

const getTopLevelSections = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [] as string[];
  }

  return Object.keys(value);
};

const getValueAtPath = (source: any, path: Array<string | number>) => path.reduce((current, key) => current?.[key], source);

const getValueTypeLabel = (value: any) => {
  if (Array.isArray(value)) {
    return `数组 · ${value.length} 项`;
  }

  if (value === null) {
    return '空值';
  }

  if (typeof value === 'object') {
    return `对象 · ${Object.keys(value).length} 个字段`;
  }

  if (typeof value === 'boolean') {
    return '布尔值';
  }

  if (typeof value === 'number') {
    return '数字';
  }

  return '文本';
};

const getPathKey = (path: Array<string | number>) => path.join('.');

const shouldDefaultCollapse = (value: any) => {
  if (Array.isArray(value)) {
    return value.length > 4;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 4;
  }

  return false;
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  const [skillsChannelFilter, setSkillsChannelFilter] = useState<string | null>(null);
  const [skillsAccountFilter, setSkillsAccountFilter] = useState<string | null>(null);
  const [skillsConfigPreviewOpen, setSkillsConfigPreviewOpen] = useState(false);
  const [skillsConfigPreview, setSkillsConfigPreview] = useState('');
  const [globalAgentConfigOpen, setGlobalAgentConfigOpen] = useState(false);
  const [globalAgentConfigDraft, setGlobalAgentConfigDraft] = useState('');
  const [globalAgentConfigSaving, setGlobalAgentConfigSaving] = useState(false);
  const [globalBindingEditor, setGlobalBindingEditor] = useState<GlobalBindingEditorState | null>(null);
  const [globalBindingDraft, setGlobalBindingDraft] = useState('');
  const [globalBindingSaving, setGlobalBindingSaving] = useState(false);
  const [managedFileOpen, setManagedFileOpen] = useState(false);
  const [managedFile, setManagedFile] = useState<AgentManagedFileDetail | null>(null);
  const [managedDraft, setManagedDraft] = useState('');
  const [managedSaving, setManagedSaving] = useState(false);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedJsonDraft, setManagedJsonDraft] = useState<any | null>(null);
  const [managedJsonBaseline, setManagedJsonBaseline] = useState<any | null>(null);
  const [managedActiveSection, setManagedActiveSection] = useState<string>('');
  const [managedSearch, setManagedSearch] = useState('');
  const [collapsedJsonPaths, setCollapsedJsonPaths] = useState<Record<string, boolean>>({});
  const [managedViewMode, setManagedViewMode] = useState<'conversation' | 'table' | 'raw'>('raw');
  const [selectedSessionEvent, setSelectedSessionEvent] = useState<SessionEventRecord | null>(null);

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
      setManagedActiveSection(getTopLevelSections(parsedJson)[0] || '');
      setManagedSearch('');
      setCollapsedJsonPaths({});
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
    setManagedActiveSection('');
    setManagedSearch('');
    setCollapsedJsonPaths({});
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
      setManagedActiveSection((current) => current || getTopLevelSections(parsedJson)[0] || '');
      setCollapsedJsonPaths({});
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
    setGlobalAgentConfigDraft(JSON.stringify(rawConfig || {}, null, 2));
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
      const parsed = JSON.parse(globalAgentConfigDraft || '{}');
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
      await loadWorkspace();
    } catch (globalConfigError) {
      setError(`保存全局 Agent 配置时发生异常: ${globalConfigError instanceof Error ? globalConfigError.message : String(globalConfigError)}`);
    } finally {
      setGlobalAgentConfigSaving(false);
    }
  };

  const openGlobalBindingEditor = (index: number) => {
    const bindingRecord = details?.globalAgentConfig?.bindings?.[index];
    if (!bindingRecord) {
      return;
    }

    setError(null);
    setSaveMessage(null);
    setGlobalBindingEditor({
      index,
      channel: bindingRecord.channel,
      accountId: bindingRecord.accountId,
      binding: bindingRecord.binding,
      accountConfig: bindingRecord.accountConfig,
    });
    setGlobalBindingDraft(JSON.stringify({
      binding: bindingRecord.binding,
      accountConfig: bindingRecord.accountConfig ?? null,
    }, null, 2));
  };

  const closeGlobalBindingEditor = () => {
    if (!globalBindingEditor) {
      return;
    }

    const baseline = JSON.stringify({
      binding: globalBindingEditor.binding,
      accountConfig: globalBindingEditor.accountConfig ?? null,
    }, null, 2);

    if (globalBindingDraft !== baseline) {
      const shouldClose = window.confirm('你有未保存的绑定配置修改，确认关闭吗？');
      if (!shouldClose) {
        return;
      }
    }

    setGlobalBindingEditor(null);
    setGlobalBindingDraft('');
  };

  const handleSaveGlobalBindingConfig = async () => {
    if (!agentId || !globalBindingEditor) {
      return;
    }

    setGlobalBindingSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const parsed = JSON.parse(globalBindingDraft || '{}');
      const nextBinding = parsed?.binding;
      const nextAccountConfig = parsed?.accountConfig;

      if (!nextBinding || typeof nextBinding !== 'object' || Array.isArray(nextBinding)) {
        setError('binding 必须是一个对象');
        return;
      }

      const configResult = await window.electronAPI.configGet();
      if (!configResult.success || !configResult.config) {
        setError(configResult.error || '读取全局配置失败');
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
        setError('未找到当前 Agent 对应的 binding 配置');
        return;
      }

      bindings[target.index] = {
        ...target.binding,
        ...nextBinding,
      };

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

      if (channel && accountId) {
        nextConfig.channels = {
          ...(nextConfig.channels || {}),
          [channel]: {
            ...(nextConfig.channels?.[channel] || {}),
            accounts: {
              ...(nextConfig.channels?.[channel]?.accounts || {}),
              [accountId]: nextAccountConfig ?? {},
            },
          },
        };
      }

      const saveResult = await window.electronAPI.configSet(nextConfig);
      if (!saveResult.success) {
        setError(saveResult.error || '保存全局 binding 配置失败');
        return;
      }

      setSaveMessage('全局 binding / channel 配置已保存');
      setGlobalBindingEditor(null);
      setGlobalBindingDraft('');
      await loadWorkspace();
    } catch (bindingError) {
      setError(`保存全局 binding 配置时发生异常: ${bindingError instanceof Error ? bindingError.message : String(bindingError)}`);
    } finally {
      setGlobalBindingSaving(false);
    }
  };

  const toggleJsonPath = (pathKey: string) => {
    setCollapsedJsonPaths((current) => ({
      ...current,
      [pathKey]: !(current[pathKey] ?? false),
    }));
  };

  const setExpandStateForValue = (value: any, path: Array<string | number>, collapsed: boolean, nextState: Record<string, boolean>) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    nextState[getPathKey(path)] = collapsed;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        setExpandStateForValue(item, [...path, index], collapsed, nextState);
      });
      return;
    }

    Object.entries(value).forEach(([key, childValue]) => {
      if (childValue && typeof childValue === 'object') {
        setExpandStateForValue(childValue, [...path, key], collapsed, nextState);
      }
    });
  };

  const handleExpandAll = () => {
    const nextState: Record<string, boolean> = {};
    if (managedActiveSection) {
      setExpandStateForValue(getValueAtPath(managedJsonDraft, [managedActiveSection]), [managedActiveSection], false, nextState);
    }
    setCollapsedJsonPaths((current) => ({ ...current, ...nextState }));
  };

  const handleCollapseAll = () => {
    const nextState: Record<string, boolean> = {};
    if (managedActiveSection) {
      setExpandStateForValue(getValueAtPath(managedJsonDraft, [managedActiveSection]), [managedActiveSection], true, nextState);
    }
    setCollapsedJsonPaths((current) => ({ ...current, ...nextState }));
  };

  const highlightText = (value: string, search: string) => {
    if (!search) {
      return value;
    }

    const matcher = new RegExp(`(${escapeRegExp(search)})`, 'ig');
    const parts = value.split(matcher);

    return parts.map((part, index) => part.toLowerCase() === search.toLowerCase()
      ? (
          <mark
            key={`${part}-${index}`}
            style={{
              backgroundColor: 'rgba(250, 204, 21, 0.24)',
              color: 'var(--app-text)',
              padding: '0 2px',
              borderRadius: '4px',
            }}
          >
            {part}
          </mark>
        )
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>);
  };

  const renderJsonEditor = (value: any, path: Array<string | number> = [], depth = 0): React.ReactNode => {
    if (Array.isArray(value)) {
      const pathKey = getPathKey(path);
      const autoExpanded = managedSearch && hasSearchMatch(pathKey, value, managedSearch);
      const collapsed = autoExpanded ? false : (collapsedJsonPaths[pathKey] ?? shouldDefaultCollapse(value));
      const visibleItems = managedSearch
        ? value.filter((item, index) => hasSearchMatch(`${pathKey}.${index}`, item, managedSearch))
        : value;

      if (!visibleItems.length && managedSearch) {
        return null;
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {getValueTypeLabel(value)}
            </div>
            <button
              onClick={() => toggleJsonPath(pathKey)}
              className="text-xs px-3 py-1 rounded-lg border transition-all duration-200"
              style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            >
              {collapsed ? '展开' : '折叠'}
            </button>
          </div>
          {!collapsed && visibleItems.map((item, index) => (
            <div key={`${path.join('.')}-${index}`} className="rounded-xl border p-3" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="font-medium" style={{ color: 'var(--app-text)' }}>{highlightText(`#${index}`, managedSearch)}</div>
                <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {getValueTypeLabel(item)}
                </div>
              </div>
              {renderJsonEditor(item, [...path, index], depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    if (value && typeof value === 'object') {
      const pathKey = getPathKey(path);
      const autoExpanded = managedSearch && hasSearchMatch(pathKey, value, managedSearch);
      const collapsed = autoExpanded ? false : (collapsedJsonPaths[pathKey] ?? (depth > 0 && shouldDefaultCollapse(value)));
      const visibleEntries = Object.entries(value).filter(([key, childValue]) => hasSearchMatch(key, childValue, managedSearch));

      if (!visibleEntries.length && managedSearch) {
        return null;
      }

      return (
        <div className="space-y-2">
          {depth > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {getValueTypeLabel(value)}
              </div>
              <button
                onClick={() => toggleJsonPath(pathKey)}
                className="text-xs px-3 py-1 rounded-lg border transition-all duration-200"
                style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              >
                {collapsed ? '展开' : '折叠'}
              </button>
            </div>
          )}
          {!collapsed && visibleEntries.map(([key, childValue]) => (
            <div key={`${path.join('.')}-${key}`} className="rounded-xl border" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
              {childValue && typeof childValue === 'object' ? (
                <div className="p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold break-all leading-5" style={{ color: 'var(--app-text)' }}>{highlightText(key, managedSearch)}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                        {getValueTypeLabel(childValue)}
                      </div>
                    </div>
                  </div>
                  {renderJsonEditor(childValue, [...path, key], depth + 1)}
                </div>
              ) : (
                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 items-center p-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium break-all leading-5" style={{ color: 'var(--app-text)' }}>{highlightText(key, managedSearch)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      {getValueTypeLabel(childValue)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    {renderJsonEditor(childValue, [...path, key], depth + 1)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (managedSearch && !matchesSearch(getPathKey(path), managedSearch) && !String(value ?? '').toLowerCase().includes(managedSearch.toLowerCase())) {
      return null;
    }

    return (
      <input
        value={value === null ? '' : String(value)}
        onChange={(event) => setManagedJsonDraft((current: any) => updateJsonValueByPath(current, path, event.target.value))}
        className="w-full rounded-lg px-3 py-2 outline-none text-sm"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          border: '1px solid var(--app-border)',
          color: 'var(--app-text)',
          minHeight: '36px',
        }}
      />
    );
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
    setSkillsChannelFilter(null);
    setSkillsAccountFilter(null);
    setSkillsConfigPreviewOpen(false);
    setSkillsConfigPreview('');
    setGlobalAgentConfigOpen(false);
    setGlobalAgentConfigDraft('');
    setManagedFileOpen(false);
    setManagedFile(null);
    setManagedDraft('');
    setManagedJsonDraft(null);
    setManagedJsonBaseline(null);
    setManagedActiveSection('');
    setManagedSearch('');
    setCollapsedJsonPaths({});
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
  const managedSections = getTopLevelSections(managedJsonDraft);
  const managedSessionEvents = useMemo(() => isManagedSessionLog ? parseSessionEvents(managedDraft) : [], [isManagedSessionLog, managedDraft]);
  const skillsOverview = details?.skillsOverview;
  const globalAgentConfig = details?.globalAgentConfig as AgentGlobalConfigOverview | undefined;
  const filteredBindingChannels = useMemo(() => {
    const channels = skillsOverview?.bindingChannels || [];
    return skillsChannelFilter
      ? channels.filter((channel) => channel === skillsChannelFilter)
      : channels;
  }, [skillsChannelFilter, skillsOverview]);
  const filteredBindingAccounts = useMemo(() => {
    const accounts = skillsOverview?.bindingAccounts || [];
    return skillsAccountFilter
      ? accounts.filter((account) => account === skillsAccountFilter)
      : accounts;
  }, [skillsAccountFilter, skillsOverview]);
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
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate('/agents')}
                className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
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
            <button
              onClick={handleGatewayRestart}
              disabled={restartingGateway}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--app-active-bg)',
                border: '1px solid var(--app-active-border)',
                color: 'var(--app-active-text)',
              }}
            >
              <RotateCcw className={`w-4 h-4 mr-2 ${restartingGateway ? 'animate-spin' : ''}`} />
              {restartingGateway ? '重启中...' : '重启 Gateway'}
            </button>
            <button
              onClick={loadWorkspace}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
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

        <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
          <div className="space-y-6">
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold">核心文件</h2>
              </div>
              <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                选择任意核心文件进入沉浸式编辑弹窗，减少误操作，保存体验更明确。
              </div>
              <div className="space-y-2">
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

            <GlassCard className="p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">Agent 运行配置</h2>
                </div>
              </div>
              <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
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
                  <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                    {skillsOverview?.configPath || '未检测到 Skills 目录'}
                  </code>
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
                              <div
                                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
                                style={{
                                  backgroundColor: skillsOverview?.nativeSkillsEnabled ? 'rgba(16, 185, 129, 0.16)' : 'rgba(148, 163, 184, 0.14)',
                                  border: skillsOverview?.nativeSkillsEnabled ? '1px solid rgba(16, 185, 129, 0.24)' : '1px solid rgba(148, 163, 184, 0.18)',
                                  color: skillsOverview?.nativeSkillsEnabled ? '#059669' : 'var(--app-text-muted)',
                                  boxShadow: skillsOverview?.nativeSkillsEnabled ? '0 8px 24px rgba(16, 185, 129, 0.10)' : 'none',
                                }}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                {skillsOverview?.nativeSkillsEnabled ? 'Native Skills 已启用' : 'Native Skills 已关闭'}
                              </div>
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

                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr] gap-4">
                          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                            子智能体范围
                          </div>
                          <div className="flex flex-wrap gap-2.5">
                            {skillsOverview?.allowAgents?.length ? skillsOverview.allowAgents.map((agentName) => (
                              <div
                                key={agentName}
                                className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-medium"
                                style={{
                                  backgroundColor: 'rgba(99, 102, 241, 0.10)',
                                  border: '1px solid rgba(99, 102, 241, 0.16)',
                                  color: '#4F46E5',
                                }}
                              >
                                {agentName}
                              </div>
                            )) : (
                              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                                当前未配置显式的子智能体允许范围。
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>绑定通道</div>
                            <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              点击 chip 仅查看对应通道。
                            </div>
                          </div>
                          {skillsChannelFilter && (
                            <button
                              onClick={() => setSkillsChannelFilter(null)}
                              className="text-xs px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer"
                              style={{
                                backgroundColor: 'var(--app-bg-subtle)',
                                borderColor: 'var(--app-border)',
                                color: 'var(--app-text)',
                              }}
                            >
                              清除筛选
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {filteredBindingChannels.length ? filteredBindingChannels.map((channel) => (
                            <button
                              key={channel}
                              onClick={() => setSkillsChannelFilter((current) => current === channel ? null : channel)}
                              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 cursor-pointer"
                              style={{
                                backgroundColor: skillsChannelFilter === channel ? 'rgba(14, 165, 233, 0.18)' : 'var(--app-bg-subtle)',
                                border: skillsChannelFilter === channel ? '1px solid rgba(14, 165, 233, 0.30)' : '1px solid var(--app-border)',
                                color: skillsChannelFilter === channel ? '#0369A1' : 'var(--app-text)',
                                boxShadow: skillsChannelFilter === channel ? '0 10px 24px rgba(14, 165, 233, 0.10)' : '0 4px 12px rgba(15, 23, 42, 0.04)',
                                transform: skillsChannelFilter === channel ? 'translateY(-1px)' : 'none',
                              }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: skillsChannelFilter === channel ? '#0EA5E9' : 'rgba(14, 165, 233, 0.55)' }} />
                              {channel}
                            </button>
                          )) : (
                            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                              {skillsOverview?.bindingChannels?.length ? '当前筛选下没有匹配通道。' : '当前没有绑定通道。'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>绑定账号</div>
                            <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              点击 chip 仅查看对应账号。
                            </div>
                          </div>
                          {skillsAccountFilter && (
                            <button
                              onClick={() => setSkillsAccountFilter(null)}
                              className="text-xs px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer"
                              style={{
                                backgroundColor: 'var(--app-bg-subtle)',
                                borderColor: 'var(--app-border)',
                                color: 'var(--app-text)',
                              }}
                            >
                              清除筛选
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {filteredBindingAccounts.length ? filteredBindingAccounts.map((account) => (
                            <button
                              key={account}
                              onClick={() => setSkillsAccountFilter((current) => current === account ? null : account)}
                              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 cursor-pointer"
                              style={{
                                backgroundColor: skillsAccountFilter === account ? 'rgba(16, 185, 129, 0.18)' : 'var(--app-bg-subtle)',
                                border: skillsAccountFilter === account ? '1px solid rgba(16, 185, 129, 0.30)' : '1px solid var(--app-border)',
                                color: skillsAccountFilter === account ? '#047857' : 'var(--app-text)',
                                boxShadow: skillsAccountFilter === account ? '0 10px 24px rgba(16, 185, 129, 0.10)' : '0 4px 12px rgba(15, 23, 42, 0.04)',
                                transform: skillsAccountFilter === account ? 'translateY(-1px)' : 'none',
                              }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: skillsAccountFilter === account ? '#10B981' : 'rgba(16, 185, 129, 0.55)' }} />
                              {account}
                            </button>
                          )) : (
                            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                              {skillsOverview?.bindingAccounts?.length ? '当前筛选下没有匹配账号。' : '当前没有绑定账号。'}
                            </div>
                          )}
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
                  <code className="block mt-1 break-all" style={{ color: 'var(--app-text)' }}>
                    {globalAgentConfig?.configPath || '未检测到 Global Agent 配置文件'}
                  </code>
                  <div className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    当前以 `openclaw.json` 中 `agents.list[]` 的当前 Agent 条目为准。`models.json`、`auth-profiles.json` 等本地文件视为派生结果，通常由 Gateway 重启后再生成。
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                          当前模型
                        </div>
                        <div className="mt-2 text-base font-semibold break-all" style={{ color: 'var(--app-text)' }}>
                          {globalAgentConfig?.modelDisplay || '未配置'}
                        </div>
                        <div className="mt-2 text-xs break-all" style={{ color: 'var(--app-text-muted)' }}>
                          主模型：{globalAgentConfig?.modelPrimary || '未显式配置'}
                        </div>
                      </div>
                      <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                          备选模型
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {globalAgentConfig?.modelFallbacks?.length ? globalAgentConfig.modelFallbacks.map((fallback) => (
                            <span
                              key={fallback}
                              className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-medium"
                              style={{
                                backgroundColor: 'rgba(99, 102, 241, 0.10)',
                                border: '1px solid rgba(99, 102, 241, 0.16)',
                                color: '#4F46E5',
                              }}
                            >
                              {fallback}
                            </span>
                          )) : (
                            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
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
                      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                        Channel / Binding 配置
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
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                                    style={{ backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#0369A1' }}
                                  >
                                    通道 · {item.channel || '-'}
                                  </span>
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#047857' }}
                                  >
                                    账号 · {item.accountId || '-'}
                                  </span>
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                                    style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#7C3AED' }}
                                  >
                                    {item.accountConfig ? '已关联账号配置' : '未找到账号配置'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--app-bg)' }}>
                                    <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                                      绑定说明
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
                                      账号配置状态
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
                              <div className="shrink-0">
                                <AppButton onClick={() => openGlobalBindingEditor(index)} variant="secondary" size="sm">
                                  编辑配置
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        )) : (
                          <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                            当前 Agent 没有命中的 bindings / channel account 配置。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>

          </div>

          <div className="space-y-6">

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
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
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
                    className="p-3 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
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
                          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
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
                          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
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
                            <span
                              className="inline-flex items-center justify-center whitespace-nowrap min-w-[56px] px-3 py-1.5 rounded-full text-[11px] font-semibold leading-none"
                              style={{
                                backgroundColor: entry.name === 'sessions.json'
                                  ? 'rgba(14, 165, 233, 0.14)'
                                  : entry.name.endsWith('.jsonl')
                                    ? 'rgba(139, 92, 246, 0.14)'
                                    : 'rgba(148, 163, 184, 0.14)',
                                color: entry.name === 'sessions.json'
                                  ? '#38BDF8'
                                  : entry.name.endsWith('.jsonl')
                                    ? '#A78BFA'
                                    : 'var(--app-text-muted)',
                                border: entry.name === 'sessions.json'
                                  ? '1px solid rgba(14, 165, 233, 0.22)'
                                  : entry.name.endsWith('.jsonl')
                                    ? '1px solid rgba(139, 92, 246, 0.22)'
                                    : '1px solid rgba(148, 163, 184, 0.18)',
                              }}
                            >
                              {entry.name === 'sessions.json' ? '会话索引' : entry.name.endsWith('.jsonl') ? '会话日志' : entry.kind === 'directory' ? '目录' : '文件'}
                            </span>
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
                  <div style={{ color: 'var(--app-text-muted)' }}>Agent Config Root</div>
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
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.62)' }}>
          <div className="w-full max-w-6xl max-h-[90vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-semibold">{activeFile}</h2>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: currentSummary?.exists ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)', color: currentSummary?.exists ? '#10B981' : '#3B82F6' }}>
                    {currentSummary?.exists ? '已存在' : '待创建'}
                  </span>
                  {isDirty && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', color: '#F59E0B' }}>
                      未保存修改
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {currentSummary?.path || '等待读取文件路径'}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  <span>大小：{formatBytes(currentSummary?.size || 0)}</span>
                  <span>更新时间：{formatTimestamp(currentSummary?.updatedAt)}</span>
                </div>
              </div>
              <button
                onClick={closeEditor}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              推荐：修改完成后先保存，再根据内容变更决定是否点击页面右上角的 `重启 Gateway`。
            </div>

            <div className="flex-1 p-6 overflow-auto">
              <textarea
                value={currentDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDrafts((current) => ({
                    ...current,
                    [activeFile]: nextValue,
                  }));
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
                <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  正在加载文件内容...
                </div>
              )}
            </div>

            <div className="px-6 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {isDirty ? '你有未保存的修改' : '当前内容已同步到本地'}
              </div>
              <div className="flex items-center gap-3">
                <AppButton
                  onClick={closeEditor}
                  variant="secondary"
                >
                  取消
                </AppButton>
                <AppButton
                  onClick={handleSave}
                  disabled={saving || fileLoading}
                  icon={<Save className="w-4 h-4" />}
                  variant={isDirty ? 'primary' : 'success'}
                >
                  {saving ? '保存中...' : isDirty ? '保存变更' : '已保存'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {skillsConfigPreviewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.58)' }}>
          <div className="w-full max-w-5xl h-[76vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">Skills 原始配置</h3>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  基于全局配置中当前 Agent 对应的 Skills 相关片段生成，只读预览。
                </div>
              </div>
              <button
                onClick={() => setSkillsConfigPreviewOpen(false)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6">
              <pre
                className="w-full h-full rounded-2xl p-5 text-sm font-mono whitespace-pre-wrap break-words"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {skillsConfigPreview}
              </pre>
            </div>
          </div>
        </div>
      )}

      {globalAgentConfigOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.58)' }}>
          <div className="w-full max-w-5xl h-[78vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">编辑全局 Agent 配置</h3>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  直接修改 `openclaw.json` 中当前 Agent 对应的 `agents.list[]` 条目。保存后建议重启 Gateway，让派生配置重新生成。
                </div>
              </div>
              <button
                onClick={() => setGlobalAgentConfigOpen(false)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-auto">
              <textarea
                value={globalAgentConfigDraft}
                onChange={(event) => setGlobalAgentConfigDraft(event.target.value)}
                spellCheck={false}
                className="w-full min-h-[56vh] rounded-2xl p-5 font-mono text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-border)',
                }}
              />
            </div>

            <div className="px-6 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                这里编辑的是全局核心配置，不是派生的 `models.json` / `auth-profiles.json`。
              </div>
              <div className="flex items-center gap-3">
                <AppButton onClick={() => setGlobalAgentConfigOpen(false)} variant="secondary">
                  取消
                </AppButton>
                <AppButton
                  onClick={handleSaveGlobalAgentConfig}
                  disabled={globalAgentConfigSaving}
                  icon={<Save className="w-4 h-4" />}
                >
                  {globalAgentConfigSaving ? '保存中...' : '保存全局配置'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {globalBindingEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.58)' }}>
          <div className="w-full max-w-5xl h-[78vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">编辑 Channel / Binding 配置</h3>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  这里会一起修改当前 Agent 的 binding 规则，以及对应 channel account 的全局配置。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#0369A1' }}>
                    通道 · {globalBindingEditor.channel || '-'}
                  </span>
                  <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#047857' }}>
                    账号 · {globalBindingEditor.accountId || '-'}
                  </span>
                </div>
              </div>
              <button
                onClick={closeGlobalBindingEditor}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-auto">
              <textarea
                value={globalBindingDraft}
                onChange={(event) => setGlobalBindingDraft(event.target.value)}
                spellCheck={false}
                className="w-full min-h-[56vh] rounded-2xl p-5 font-mono text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-border)',
                }}
              />
            </div>

            <div className="px-6 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                请保持 JSON 结构为 <code>{'{"binding": ..., "accountConfig": ...}'}</code>，保存后会直接更新全局 `openclaw.json`。
              </div>
              <div className="flex items-center gap-3">
                <AppButton onClick={closeGlobalBindingEditor} variant="secondary">
                  取消
                </AppButton>
                <AppButton
                  onClick={handleSaveGlobalBindingConfig}
                  disabled={globalBindingSaving}
                  icon={<Save className="w-4 h-4" />}
                >
                  {globalBindingSaving ? '保存中...' : '保存绑定配置'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {managedFileOpen && selectedSessionEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.58)' }}>
          <div className="w-full max-w-4xl max-h-[82vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-semibold">事件详情</h3>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                    {selectedSessionEvent.type || '事件'}
                  </span>
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {formatTimestamp(selectedSessionEvent.timestamp)}
                  {selectedSessionEvent.role ? ` · ${selectedSessionEvent.role}` : ''}
                </div>
              </div>
              <button
                onClick={() => setSelectedSessionEvent(null)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
              <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                <div className="text-sm font-medium mb-2">可读详情</div>
                <div className="text-sm whitespace-pre-wrap break-words leading-6" style={{ color: 'var(--app-text)' }}>
                  {selectedSessionEvent.detail || '暂无详情'}
                </div>
              </div>
              <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                <div className="text-sm font-medium mb-2">原始事件 JSON</div>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono" style={{ color: 'var(--app-text-muted)' }}>
                  {JSON.stringify(selectedSessionEvent.raw, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {entryBrowserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.62)' }}>
          <div className="w-full max-w-5xl h-[82vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                <h3 className="text-2xl font-semibold">{entryBrowserOpen === 'workspace' ? '浏览 Workspace' : entryBrowserOpen === 'config' ? '浏览 Agent 配置' : '浏览 Sessions'}</h3>
                <div className="text-sm mt-2 break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {entryBrowserOpen === 'workspace'
                    ? workspaceBrowse?.currentPath || details?.workspaceRoot
                    : entryBrowserOpen === 'config'
                      ? details?.agentConfigRoot
                      : details?.sessionsRoot}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {entryBrowserOpen === 'workspace' && workspaceCanGoUp && workspaceParentPath && (
                  <AppButton onClick={() => browseWorkspacePath(workspaceParentPath)} size="sm" variant="secondary">
                    返回上级
                  </AppButton>
                )}
                <button
                  onClick={closeEntryBrowser}
                  className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                    当前路径
                  </div>
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
            <div className="flex-1 min-h-0 overflow-hidden p-6">
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
                            {entry.kind === 'directory'
                              ? <Folder className="w-4 h-4" />
                              : <FileText className="w-4 h-4" />}
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
                        <span
                          className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            backgroundColor: entry.kind === 'directory' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                            color: entry.kind === 'directory' ? '#60A5FA' : '#34D399',
                            border: entry.kind === 'directory' ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid rgba(16, 185, 129, 0.18)',
                          }}
                        >
                          {entry.kind === 'directory' ? '目录' : '文件'}
                        </span>
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
                          <AppButton
                            onClick={() => openWorkspaceEntry(entry)}
                            variant="secondary"
                            size="sm"
                          >
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
                        <span style={{ color: 'var(--app-table-cell-muted-text)' }}>
                          {getEntryKindLabel(entry)}
                        </span>
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
                          <AppButton
                            onClick={() => openManagedFile(entry.path)}
                            variant="secondary"
                            size="sm"
                          >
                            打开
                          </AppButton>
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
          </div>
        </div>
      )}

      {managedFileOpen && managedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.62)' }}>
          <div className="w-full max-w-6xl h-[90vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-semibold break-all">{managedFile.name}</h2>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
                    {isManagedSessionLog ? '会话日志' : isManagedJson ? '动态表单' : '文本内容'}
                  </span>
                  {isManagedDirty && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', color: '#F59E0B' }}>
                      未保存修改
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {managedFile.path}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  <span>大小：{formatBytes(managedFile.size || 0)}</span>
                  <span>更新时间：{formatTimestamp(managedFile.updatedAt)}</span>
                </div>
              </div>
              <button
                onClick={closeManagedFile}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 border-b text-sm flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              <div className="min-w-0">
                {isManagedSessionLog
                  ? '会话日志已支持会话视图、事件表格和原始文本三种模式切换。'
                  : isManagedJson
                  ? 'JSON 配置采用分组编辑，只有真正改动内容后才会提示未保存。'
                  : '文本内容按原始文本方式编辑，保存前不会改动文件。'}
              </div>
              {isManagedSessionLog ? (
                <div className="flex items-center gap-2 shrink-0">
                  {([
                    { key: 'conversation', label: '会话视图' },
                    { key: 'table', label: '事件表格' },
                    { key: 'raw', label: '原始文本' },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setManagedViewMode(item.key)}
                      className="px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200"
                      style={managedViewMode === item.key
                        ? {
                            background: 'var(--app-selected-card-bg)',
                            border: '1px solid var(--app-selected-card-border)',
                            color: 'var(--app-text)',
                            boxShadow: 'var(--app-selected-card-shadow)',
                          }
                        : {
                            backgroundColor: 'var(--app-bg-subtle)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--app-text-muted)',
                          }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : isManagedJson && managedSections.length > 0 && (
                <div className="text-xs shrink-0" style={{ color: 'var(--app-text-muted)' }}>
                  分组数：{managedSections.length}
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {isManagedSessionLog && managedViewMode !== 'raw' ? (
                <div className="h-full min-h-0 overflow-auto p-6">
                  {managedViewMode === 'conversation' ? (
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
                              <span
                                className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
                                style={{
                                  backgroundColor: tone.bg,
                                  border: `1px solid ${tone.border}`,
                                  color: tone.text,
                                }}
                              >
                                {tone.label}
                              </span>
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
                                className="px-2.5 py-1 rounded-lg border transition-all duration-200"
                                style={{
                                  backgroundColor: 'var(--app-bg-subtle)',
                                  borderColor: 'var(--app-border)',
                                  color: 'var(--app-text)',
                                }}
                              >
                                查看详情
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <AppTable
                      className="max-h-full"
                      rows={managedSessionEvents}
                      stickyHeader
                      columns={[
                        {
                          key: 'type',
                          label: '类型',
                          width: '120px',
                          render: (event) => (
                            <span className="truncate block">{event.type || '-'}</span>
                          ),
                        },
                        {
                          key: 'timestamp',
                          label: '时间',
                          width: '180px',
                          render: (event) => (
                            <span className="truncate block" style={{ color: 'var(--app-text-muted)' }}>
                              {formatTimestamp(event.timestamp)}
                            </span>
                          ),
                        },
                        {
                          key: 'role',
                          label: '角色',
                          width: '100px',
                          render: (event) => (
                            <span className="truncate block" style={{ color: 'var(--app-text-muted)' }}>
                              {event.role || '-'}
                            </span>
                          ),
                        },
                        {
                          key: 'summary',
                          label: '摘要',
                          cellClassName: 'min-w-0',
                          render: (event) => (
                            <span className="line-clamp-2 block leading-6" title={event.detail}>{event.summary || '-'}</span>
                          ),
                        },
                        {
                          key: 'action',
                          label: '详情',
                          width: '104px',
                          align: 'right',
                          render: (event) => (
                            <div className="flex justify-end">
                              <AppButton
                                onClick={() => setSelectedSessionEvent(event)}
                                size="sm"
                                variant="secondary"
                              >
                                查看
                              </AppButton>
                            </div>
                          ),
                        },
                      ]}
                      emptyText="当前没有可展示的会话事件"
                    />
                  )}
                </div>
              ) : isManagedJson && managedJsonDraft !== null ? (
                <div className="h-full min-h-0 grid grid-cols-[260px_minmax(0,1fr)] overflow-hidden items-stretch">
                  <div className="h-full min-h-0 border-r p-4 overflow-auto" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
                    <div className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--app-text-muted)' }}>
                      顶层分组
                    </div>
                    <input
                      value={managedSearch}
                      onChange={(event) => setManagedSearch(event.target.value)}
                      placeholder="搜索字段 / 值"
                      className="w-full rounded-xl px-4 py-3 mb-3 outline-none"
                      style={{
                        backgroundColor: 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={handleExpandAll}
                          className="text-xs px-3 py-2 rounded-lg border transition-all duration-200"
                          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                        >
                          全部展开
                        </button>
                        <button
                          onClick={handleCollapseAll}
                          className="text-xs px-3 py-2 rounded-lg border transition-all duration-200"
                          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                        >
                          全部折叠
                        </button>
                      </div>
                      {managedSections
                        .filter((section) => hasSearchMatch(section, managedJsonDraft?.[section], managedSearch))
                        .map((section) => (
                        <button
                          key={section}
                          onClick={() => setManagedActiveSection(section)}
                          className="w-full rounded-xl px-4 py-3 text-left transition-all duration-200"
                          style={managedActiveSection === section
                            ? {
                                background: 'var(--app-selected-card-bg)',
                                border: '1px solid var(--app-selected-card-border)',
                                boxShadow: 'var(--app-selected-card-shadow)',
                                color: 'var(--app-text)',
                              }
                            : {
                                backgroundColor: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--app-text)',
                              }}
                        >
                          <div className="font-medium break-all">{highlightText(section, managedSearch)}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                            {Array.isArray(managedJsonDraft?.[section])
                              ? `${managedJsonDraft?.[section]?.length || 0} 项`
                              : managedJsonDraft?.[section] && typeof managedJsonDraft?.[section] === 'object'
                                ? `${Object.keys(managedJsonDraft?.[section] || {}).length} 个字段`
                                : '基础字段'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-full min-h-0 overflow-hidden flex flex-col">
                    <div className="flex-1 min-h-0 overflow-auto p-6">
                      {managedActiveSection ? (
                        <div className="space-y-3 pb-6">
                          <div className="rounded-xl border p-3" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>当前分组</div>
                            <div className="mt-1 text-lg font-semibold break-all">{managedActiveSection}</div>
                          </div>
                          {renderJsonEditor(getValueAtPath(managedJsonDraft, [managedActiveSection]), [managedActiveSection])}
                        </div>
                      ) : (
                        <div className="rounded-2xl border p-6 text-sm" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                          当前 JSON 没有可展示的顶层分组。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-0 p-6 overflow-auto">
                  <textarea
                    value={managedDraft}
                    onChange={(event) => setManagedDraft(event.target.value)}
                    spellCheck={false}
                    className="w-full min-h-[60vh] rounded-2xl p-5 font-mono text-sm outline-none resize-y"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      color: 'var(--app-text)',
                      border: '1px solid var(--app-border)',
                    }}
                  />
                </div>
              )}
              {managedLoading && (
                <div className="px-6 pb-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  正在加载内容...
                </div>
              )}
            </div>
            <div className="px-6 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {isManagedDirty ? '你有未保存的修改' : '当前内容已同步到本地'}
              </div>
              <div className="flex items-center gap-3">
                <AppButton onClick={closeManagedFile} variant="secondary">关闭</AppButton>
                <AppButton onClick={handleSaveManagedFile} disabled={managedSaving || managedLoading} icon={<Save className="w-4 h-4" />} variant={isManagedDirty ? 'primary' : 'success'}>
                  {managedSaving ? '保存中...' : isManagedDirty ? '保存修改' : '已保存'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {memoryEditorOpen && memoryFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.62)' }}>
          <div className="w-full max-w-5xl max-h-[88vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-semibold">{memoryFile.name}</h2>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
                    记忆文件
                  </span>
                  {isMemoryDirty && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', color: '#F59E0B' }}>
                      未保存修改
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {memoryFile.path}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  <span>大小：{formatBytes(memoryFile.size || 0)}</span>
                  <span>更新时间：{formatTimestamp(memoryFile.updatedAt)}</span>
                </div>
              </div>
              <button
                onClick={closeMemoryEditor}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              你可以在这里查看、修改或清空智能体记忆内容。关闭前若存在未保存修改，会提示确认。
            </div>

            <div className="flex-1 p-6 overflow-auto">
              <textarea
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                spellCheck={false}
                className="w-full min-h-[52vh] rounded-2xl p-5 font-mono text-sm outline-none resize-y"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-border)',
                }}
              />
              {memoryLoading && (
                <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  正在加载记忆内容...
                </div>
              )}
            </div>

            <div className="px-6 py-5 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {isMemoryDirty ? '你有未保存的记忆修改' : '当前记忆内容已同步到本地'}
              </div>
              <div className="flex items-center gap-3">
                <AppButton
                  onClick={handleClearMemory}
                  disabled={memorySaving || memoryClearing}
                  variant="danger"
                >
                  {memoryClearing ? '清空中...' : '清除记忆'}
                </AppButton>
                <AppButton
                  onClick={closeMemoryEditor}
                  variant="secondary"
                >
                  关闭
                </AppButton>
                <AppButton
                  onClick={handleSaveMemory}
                  disabled={memorySaving || memoryClearing}
                  icon={<Save className="w-4 h-4" />}
                  variant={isMemoryDirty ? 'primary' : 'success'}
                >
                  {memorySaving ? '保存中...' : isMemoryDirty ? '保存修改' : '已保存'}
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {renamingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}>
          <div className="w-full max-w-lg rounded-3xl border overflow-hidden" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                <h3 className="text-xl font-semibold">重命名</h3>
                <div className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                  当前条目：{renamingEntry.name}
                </div>
              </div>
              <button
                onClick={() => setRenamingEntry(null)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                只修改当前层级名称，不会移动到别的目录。
              </div>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="w-full rounded-xl px-4 py-3 outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
            </div>
            <div className="px-6 py-5 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--app-border)' }}>
              <button
                onClick={() => setRenamingEntry(null)}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
              >
                取消
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={renameSaving || !renameValue.trim()}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--app-active-bg)', border: '1px solid var(--app-active-border)', color: 'var(--app-active-text)' }}
              >
                {renameSaving ? '保存中...' : '确认重命名'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}>
          <div className="w-full max-w-xl rounded-3xl border overflow-hidden" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                <h3 className="text-xl font-semibold">安全删除确认</h3>
                <div className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                  删除不会直接移除，而是放入回收站，可稍后恢复。
                </div>
              </div>
              <button
                onClick={() => setDeletingEntry(null)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>即将移入回收站的条目</div>
              <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                <div className="font-semibold">{deletingEntry.name}</div>
                <div className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
                  {deletingEntry.kind === 'directory' ? '目录' : '文件'} · {deletingEntry.relativePath}
                </div>
                <div className="text-xs mt-2 break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {deletingEntry.path}
                </div>
              </div>
            </div>
            <div className="px-6 py-5 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--app-border)' }}>
              <button
                onClick={() => setDeletingEntry(null)}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
                style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteSubmit}
                disabled={deleteSaving}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.20)', color: '#EF4444' }}
              >
                {deleteSaving ? '移动中...' : '移入回收站'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.62)' }}>
          <div className="w-full max-w-5xl max-h-[88vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                <h3 className="text-2xl font-semibold">Workspace 回收站</h3>
                <div className="text-sm mt-2 break-all" style={{ color: 'var(--app-text-muted)' }}>
                  {trashRoot || '回收站路径加载中'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadTrashEntries}
                  disabled={trashLoading}
                  className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${trashLoading ? 'animate-spin' : ''}`} />
                  刷新回收站
                </button>
                <button
                  onClick={() => setTrashOpen(false)}
                  className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                  style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              <div className="mb-4 rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  已选择 {selectedTrashEntryIds.length} / {trashEntries.length} 个条目
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSelectAllTrashEntries}
                    disabled={!trashEntries.length}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                  >
                    {selectedTrashEntryIds.length === trashEntries.length && trashEntries.length ? '取消全选' : '全选'}
                  </button>
                  <button
                    onClick={handleRestoreSelectedTrashEntries}
                    disabled={!selectedTrashEntryIds.length || trashBatchAction !== null}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--app-active-bg)', border: '1px solid var(--app-active-border)', color: 'var(--app-active-text)' }}
                  >
                    <ArchiveRestore className="w-4 h-4 mr-2" />
                    {trashBatchAction === 'restore' ? '批量恢复中...' : '批量恢复'}
                  </button>
                  <button
                    onClick={handleDeleteSelectedTrashEntries}
                    disabled={!selectedTrashEntryIds.length || trashBatchAction !== null}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.20)', color: '#EF4444' }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {trashBatchAction === 'delete' ? '批量删除中...' : '批量永久删除'}
                  </button>
                  <button
                    onClick={handleClearTrash}
                    disabled={!trashEntries.length || trashBatchAction !== null}
                    className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.20)', color: '#EF4444' }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {trashBatchAction === 'clear' ? '清空中...' : '一键清空回收站'}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {trashEntries.length ? trashEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border p-4"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <label className="pt-1">
                        <input
                          type="checkbox"
                          checked={selectedTrashEntryIds.includes(entry.id)}
                          onChange={() => toggleTrashEntrySelection(entry.id)}
                          className="h-4 w-4"
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold">{entry.name}</div>
                          <span className="text-[11px] px-2 py-1 rounded-full" style={{ backgroundColor: entry.kind === 'directory' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)', color: entry.kind === 'directory' ? '#3B82F6' : '#10B981' }}>
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestoreTrashEntry(entry.id)}
                          disabled={trashRestoringId === entry.id || trashBatchAction !== null}
                          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: 'var(--app-active-bg)', border: '1px solid var(--app-active-border)', color: 'var(--app-active-text)' }}
                        >
                          <ArchiveRestore className="w-4 h-4 mr-2" />
                          {trashRestoringId === entry.id ? '恢复中...' : '恢复'}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border p-6 text-sm" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                    {trashLoading ? '正在加载回收站...' : '回收站当前为空。'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentWorkspace;
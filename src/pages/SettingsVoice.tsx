import React, { useEffect, useMemo, useState } from 'react';
import {
  AudioLines,
  Globe2,
  Mic,
  Plus,
  Sparkles,
  Trash2,
  Volume2,
  Waves,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppSelect from '../components/AppSelect';
import { useI18n } from '../i18n/I18nContext';
import ToggleRow from './settings/general/ToggleRow';

type VoiceSettingsModel = {
  additionalLanguages: string[];
  holdToTalk: boolean;
  microphoneId: string;
  recognitionLanguage: string;
  sendSound: string;
  triggerSound: string;
  triggerWords: string[];
  voiceWakeEnabled: boolean;
};

const LANGUAGE_OPTIONS = [
  {
    value: 'zh-CN',
    label: '中文（中国大陆）',
    description: '适合普通话与中文唤醒词。',
  },
  {
    value: 'zh-HK',
    label: '中文（中国香港）',
    description: '适合粤语环境与混合语音输入。',
  },
  {
    value: 'en-US',
    label: 'English (United States)',
    description: '适合英文口令与国际化工作流。',
  },
  {
    value: 'ja-JP',
    label: '日本語',
    description: '适合日语对话和本地唤醒测试。',
  },
] as const;

const MICROPHONE_OPTIONS = [
  {
    value: 'system-default',
    label: '系统默认麦克风',
    description: '跟随当前系统输入设备。',
  },
  {
    value: 'macbook-mic',
    label: 'MacBook Pro 麦克风',
    description: '内建阵列麦克风，适合近场收音。',
  },
  {
    value: 'airpods-pro',
    label: 'AirPods Pro',
    description: '无线耳机输入，适合移动办公。',
  },
  {
    value: 'studio-usb',
    label: 'USB Studio Mic',
    description: '高灵敏度麦克风，适合长时语音交互。',
  },
] as const;

const SOUND_OPTIONS = [
  {
    value: 'glass',
    label: 'Glass',
    description: '轻量、清脆，适合作为系统提示音。',
  },
  {
    value: 'pulse',
    label: 'Pulse',
    description: '更明显的反馈音，适合嘈杂环境。',
  },
  {
    value: 'soft-bell',
    label: 'Soft Bell',
    description: '柔和提示，适合长时间开启语音模式。',
  },
] as const;

const DEFAULT_TRIGGER_WORDS = ['openclaw', 'claude', 'computer'];

const defaultVoiceSettings: VoiceSettingsModel = {
  additionalLanguages: ['en-US'],
  holdToTalk: false,
  microphoneId: 'system-default',
  recognitionLanguage: 'zh-CN',
  sendSound: 'glass',
  triggerSound: 'glass',
  triggerWords: DEFAULT_TRIGGER_WORDS,
  voiceWakeEnabled: true,
};

const meterBars = Array.from({ length: 14 }, (_, index) => index);

const SettingsVoice: React.FC = () => {
  const { t } = useI18n();
  const [settings, setSettings] = useState<VoiceSettingsModel>(defaultVoiceSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingWord, setPendingWord] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testPhase, setTestPhase] = useState<'idle' | 'listening' | 'detected'>('idle');
  const [audioLevel, setAudioLevel] = useState(0.12);

  const tx = (key: string) => t(key as any);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAudioLevel((current) => {
        const next = settings.voiceWakeEnabled
          ? Math.min(1, Math.max(0.08, current + (Math.random() * 0.42 - 0.18)))
          : Math.max(0.04, current * 0.6);
        return Number(next.toFixed(2));
      });
    }, 900);

    return () => {
      window.clearInterval(timer);
    };
  }, [settings.voiceWakeEnabled]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setMessage('');
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  const activeLanguages = useMemo(() => {
    return [settings.recognitionLanguage, ...settings.additionalLanguages]
      .filter((value, index, collection) => collection.indexOf(value) === index);
  }, [settings.additionalLanguages, settings.recognitionLanguage]);

  const loadSettings = async () => {
    try {
      const result = await window.electronAPI.settingsGet();
      if (!result.success || !result.settings) {
        return;
      }

      const savedSettings = result.settings as Partial<VoiceSettingsModel>;
      setSettings((prev) => ({
        ...prev,
        ...savedSettings,
        additionalLanguages: Array.isArray(savedSettings.additionalLanguages)
          ? savedSettings.additionalLanguages.filter((item) => typeof item === 'string')
          : prev.additionalLanguages,
        triggerWords: Array.isArray(savedSettings.triggerWords)
          ? savedSettings.triggerWords.filter((item) => typeof item === 'string' && item.trim())
          : prev.triggerWords,
      }));
    } catch (error) {
      console.error('Failed to load voice settings:', error);
      setMessage(tx('settings.voiceLoadFailed'));
    }
  };

  const persistSettings = async (updates: Partial<VoiceSettingsModel>) => {
    try {
      setIsSaving(true);
      const nextSettings = {
        ...settings,
        ...updates,
      };
      const result = await window.electronAPI.settingsSet(nextSettings as any);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save voice settings');
      }
      setSettings(nextSettings);
      setMessage(tx('settings.voiceSaved'));
    } catch (error) {
      console.error('Failed to save voice settings:', error);
      setMessage(tx('settings.voiceSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingChange = async <K extends keyof VoiceSettingsModel>(
    key: K,
    value: VoiceSettingsModel[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));

    await persistSettings({
      [key]: value,
    } as Partial<VoiceSettingsModel>);
  };

  const handleRecognitionLanguageChange = async (value: string | string[]) => {
    if (typeof value !== 'string') {
      return;
    }

    const nextAdditionalLanguages = settings.additionalLanguages.filter((item) => item !== value);
    setSettings((prev) => ({
      ...prev,
      recognitionLanguage: value,
      additionalLanguages: nextAdditionalLanguages,
    }));

    await persistSettings({
      recognitionLanguage: value,
      additionalLanguages: nextAdditionalLanguages,
    });
  };

  const handleAdditionalLanguagesChange = async (value: string | string[]) => {
    const nextValues = (Array.isArray(value) ? value : [value]).filter((item) => item !== settings.recognitionLanguage);
    await handleSettingChange('additionalLanguages', nextValues);
  };

  const handleAddWord = async () => {
    const nextWord = pendingWord.trim().toLowerCase();
    if (!nextWord || settings.triggerWords.includes(nextWord)) {
      return;
    }

    const nextWords = [...settings.triggerWords, nextWord];
    setPendingWord('');
    await handleSettingChange('triggerWords', nextWords);
  };

  const handleRemoveWord = async (word: string) => {
    await handleSettingChange(
      'triggerWords',
      settings.triggerWords.filter((item) => item !== word),
    );
  };

  const handleResetWords = async () => {
    await handleSettingChange('triggerWords', DEFAULT_TRIGGER_WORDS);
  };

  const handleRunTest = () => {
    setIsTesting(true);
    setTestPhase('listening');

    window.setTimeout(() => {
      setTestPhase('detected');
      setAudioLevel(0.82);
    }, 1400);

    window.setTimeout(() => {
      setIsTesting(false);
      setTestPhase('idle');
      setMessage(tx('settings.voiceTestDetected'));
    }, 3000);
  };

  const levelCount = Math.max(1, Math.round(audioLevel * meterBars.length));
  const levelText = `${Math.round(-54 + audioLevel * 48)} dB`;
  const recognitionLabel = LANGUAGE_OPTIONS.find((item) => item.value === settings.recognitionLanguage)?.label
    || settings.recognitionLanguage;

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-[28px] border"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(139, 92, 246, 0.15) 42%, rgba(167, 139, 250, 0.12))',
          borderColor: 'rgba(139, 92, 246, 0.32)',
          boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.12), 0 22px 50px rgba(139, 92, 246, 0.15)',
        }}
      >
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.3fr)_360px] lg:px-7 lg:py-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(139, 92, 246, 0.12))',
                borderColor: 'rgba(139, 92, 246, 0.36)',
                color: 'rgba(167, 139, 250, 0.96)',
                boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.08), 0 2px 8px rgba(139, 92, 246, 0.12)',
              }}
            >
              <Sparkles size={14} />
              {tx('settings.voiceHeroBadge')}
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border"
                style={{
                  borderColor: 'rgba(129, 140, 248, 0.24)',
                  backgroundColor: 'rgba(99, 102, 241, 0.12)',
                  color: 'rgba(167, 139, 250, 0.96)',
                }}
              >
                <AudioLines size={26} />
              </div>
              <div className="min-w-0">
                <h2 className="text-3xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {tx('settings.voiceStudioTitle')}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  {tx('settings.voiceStudioDescription')}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {activeLanguages.map((language) => {
                const option = LANGUAGE_OPTIONS.find((item) => item.value === language);
                return (
                  <div
                    key={language}
                    className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm"
                    style={{
                      borderColor: 'rgba(129, 140, 248, 0.18)',
                      backgroundColor: 'rgba(99, 102, 241, 0.06)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <Globe2 size={15} />
                    {option?.label || language}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div
              className="rounded-3xl border p-4"
              style={{
                borderColor: 'rgba(129, 140, 248, 0.16)',
                backgroundColor: 'rgba(99, 102, 241, 0.04)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {tx('settings.voicePrimaryLanguage')}
              </div>
              <div className="mt-2 text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {recognitionLabel}
              </div>
            </div>
            <div
              className="rounded-3xl border p-4"
              style={{
                borderColor: 'rgba(129, 140, 248, 0.16)',
                backgroundColor: 'rgba(99, 102, 241, 0.04)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {tx('settings.voiceWakeWordsCount')}
              </div>
              <div className="mt-2 text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {settings.triggerWords.length}
              </div>
            </div>
            <div
              className="rounded-3xl border p-4"
              style={{
                borderColor: 'rgba(129, 140, 248, 0.16)',
                backgroundColor: 'rgba(99, 102, 241, 0.04)',
              }}
            >
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {tx('settings.voiceMode')}
              </div>
              <div className="mt-2 text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {settings.holdToTalk ? tx('settings.voiceModePushToTalk') : tx('settings.voiceModeHandsFree')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            borderColor: 'var(--app-border)',
            backgroundColor: 'var(--app-bg-elevated)',
            color: 'var(--app-text)',
          }}
        >
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceRuntimeTitle')}
                </div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceRuntimeHeadline')}
                </div>
                <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceRuntimeDescription')}
                </div>
              </div>
              <div
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: settings.voiceWakeEnabled 
                    ? 'rgba(99, 102, 241, 0.15)' 
                    : 'rgba(148, 163, 184, 0.12)',
                  color: settings.voiceWakeEnabled 
                    ? 'rgba(99, 102, 241, 0.92)' 
                    : 'rgba(148, 163, 184, 0.78)',
                  border: settings.voiceWakeEnabled 
                    ? '1px solid rgba(99, 102, 241, 0.24)' 
                    : '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                {settings.voiceWakeEnabled ? t('settings.voiceEnabledState') : t('settings.voiceDisabledState')}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <ToggleRow
                  checked={settings.voiceWakeEnabled}
                  label={t('settings.voiceEnableToggle')}
                  description={t('settings.voiceEnableToggleDescription')}
                  onChange={(value) => void handleSettingChange('voiceWakeEnabled', value)}
                />
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <ToggleRow
                  checked={settings.holdToTalk}
                  label={t('settings.voiceHoldToTalkToggle')}
                  description={t('settings.voiceHoldToTalkDescription')}
                  onChange={(value) => void handleSettingChange('holdToTalk', value)}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceRecognitionLanguageLabel')}
                </div>
                <AppSelect
                  size="md"
                  options={[...LANGUAGE_OPTIONS]}
                  value={settings.recognitionLanguage}
                  onChange={(value) => void handleRecognitionLanguageChange(value)}
                  placeholder={t('settings.voiceRecognitionLanguagePlaceholder')}
                  searchPlaceholder={t('settings.voiceSearchLanguagePlaceholder')}
                />
              </div>
              <div>
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceAdditionalLanguagesLabel')}
                </div>
                <AppSelect
                  size="md"
                  multiple
                  options={LANGUAGE_OPTIONS.filter((item) => item.value !== settings.recognitionLanguage)}
                  value={settings.additionalLanguages}
                  onChange={(value) => void handleAdditionalLanguagesChange(value)}
                  placeholder={t('settings.voiceAdditionalLanguagesPlaceholder')}
                  searchPlaceholder={t('settings.voiceSearchLanguagePlaceholder')}
                />
              </div>
            </div>
          </section>

          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                {t('settings.voiceInputTitle')}
              </div>
              <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {t('settings.voiceInputHeadline')}
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceMicrophoneLabel')}
                </div>
                <AppSelect
                  size="md"
                  options={[...MICROPHONE_OPTIONS]}
                  value={settings.microphoneId}
                  onChange={(value) => void handleSettingChange('microphoneId', value as string)}
                  placeholder={t('settings.voiceMicrophonePlaceholder')}
                  searchPlaceholder={t('settings.voiceSearchMicrophonePlaceholder')}
                />
              </div>

              <div
                className="rounded-2xl border p-4"
                style={{
                  borderColor: 'var(--app-border)',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  <Mic size={16} />
                  {t('settings.voiceInputQualityTitle')}
                </div>
                <div className="mt-3 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceInputQualityDescription')}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                    {t('settings.voiceLiveLevelLabel')}
                  </div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    {t('settings.voiceLiveLevelDescription')}
                  </div>
                </div>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  {levelText}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {meterBars.map((bar) => {
                  const active = bar < levelCount;
                  return (
                    <div
                      key={bar}
                      className="h-4 flex-1 rounded-md transition-all duration-300"
                      style={active
                        ? {
                            background: 'linear-gradient(180deg, #34D399, #10B981)',
                            boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.18)',
                            opacity: 1,
                          }
                        : {
                            backgroundColor: 'rgba(148, 163, 184, 0.18)',
                            opacity: 0.7,
                          }}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceWakeWordsTitle')}
                </div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceWakeWordsHeadline')}
                </div>
                <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceWakeWordsDescription')}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <AppButton
                  variant="secondary"
                  icon={<Plus size={16} />}
                  onClick={() => void handleAddWord()}
                  disabled={!pendingWord.trim()}
                >
                  {t('settings.voiceAddWord')}
                </AppButton>
                <AppButton variant="secondary" onClick={() => void handleResetWords()}>
                  {t('settings.voiceResetWords')}
                </AppButton>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                {t('settings.voiceNewWordLabel')}
              </div>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  value={pendingWord}
                  onChange={(event) => setPendingWord(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleAddWord();
                    }
                  }}
                  placeholder={t('settings.voiceNewWordPlaceholder')}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
                <AppButton
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => void handleAddWord()}
                  disabled={!pendingWord.trim()}
                >
                  {t('settings.voiceAddWord')}
                </AppButton>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {settings.triggerWords.map((word) => (
                <div
                  key={word}
                  className="flex items-center gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: 'var(--app-border)',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818CF8' }}
                  >
                    <Waves size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium" style={{ color: 'var(--app-text)' }}>
                      {word}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                      {t('settings.voiceWakeWordHint')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                    onClick={() => void handleRemoveWord(word)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#38BDF8' }}
              >
                <Volume2 size={20} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceTestingTitle')}
                </div>
                <div className="mt-1 text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceTestingHeadline')}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
              <div className="text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                {testPhase === 'idle' ? t('settings.voiceTestingIdle') : null}
                {testPhase === 'listening' ? t('settings.voiceTestingListening') : null}
                {testPhase === 'detected' ? t('settings.voiceTestingDetected') : null}
              </div>
            </div>

            <div className="mt-5">
              <AppButton
                variant="primary"
                onClick={handleRunTest}
                disabled={isTesting || !settings.voiceWakeEnabled}
              >
                {isTesting ? t('settings.voiceTestingRunning') : t('settings.voiceTestingStart')}
              </AppButton>
            </div>
          </section>

          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
                {t('settings.voiceSoundTitle')}
              </div>
              <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                {t('settings.voiceSoundHeadline')}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceTriggerSoundLabel')}
                </div>
                <AppSelect
                  size="md"
                  options={[...SOUND_OPTIONS]}
                  value={settings.triggerSound}
                  onChange={(value) => void handleSettingChange('triggerSound', value as string)}
                  placeholder={t('settings.voiceSoundPlaceholder')}
                  searchPlaceholder={t('settings.voiceSearchSoundPlaceholder')}
                />
              </div>
              <div>
                <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceSendSoundLabel')}
                </div>
                <AppSelect
                  size="md"
                  options={[...SOUND_OPTIONS]}
                  value={settings.sendSound}
                  onChange={(value) => void handleSettingChange('sendSound', value as string)}
                  placeholder={t('settings.voiceSoundPlaceholder')}
                  searchPlaceholder={t('settings.voiceSearchSoundPlaceholder')}
                />
              </div>
            </div>
          </section>

          <section
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.voiceInsightTitle')}
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceInsightLanguages')}
                </div>
                <div className="mt-2 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {activeLanguages.length} / {LANGUAGE_OPTIONS.length} {t('settings.voiceInsightConfigured')}
                </div>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceInsightStreaming')}
                </div>
                <div className="mt-2 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceInsightStreamingDescription')}
                </div>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {t('settings.voiceInsightRecommendation')}
                </div>
                <div className="mt-2 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                  {t('settings.voiceInsightRecommendationDescription')}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <div className="text-xs" style={{ color: 'rgba(129, 140, 248, 0.88)' }}>
          {isSaving ? t('settings.voiceSaving') : t('settings.voiceAutosaveHint')}
        </div>
      </div>
    </div>
  );
};

export default SettingsVoice;

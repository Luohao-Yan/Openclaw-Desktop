import {
  Bot,
  Cpu,
  Folder,
  Info,
  MessageSquare,
  Mic,
  Puzzle,
  Settings as SettingsIcon,
  Bell,
  Shield,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import SettingsChannels from '../SettingsChannels';
import SettingsCoreConfig from '../SettingsCoreConfig';
import SettingsGeneral from '../SettingsGeneral';
import SettingsVoice from '../SettingsVoice';
import SettingsAdvanced from '../SettingsAdvanced';
import SettingsModels from '../SettingsModels';
import type { SettingsSection } from './types';

export const useSettingsSections = (): SettingsSection[] => {
  const { t } = useI18n();

  return [
    {
      id: 'general',
      name: t('settings.general'),
      description: t('settings.generalDescription'),
      icon: SettingsIcon,
      component: SettingsGeneral,
      translateKey: 'general',
    },
    {
      id: 'channels',
      name: t('settings.channels'),
      description: t('settings.channelsDescription'),
      icon: MessageSquare,
      component: SettingsChannels,
      translateKey: 'channels',
    },
    {
      id: 'models',
      name: t('settings.models'),
      description: t('settings.modelsDescription'),
      icon: Bot,
      component: SettingsModels,
      translateKey: 'models',
    },
    {
      id: 'voice',
      name: t('settings.voice'),
      description: t('settings.voiceDescription'),
      icon: Mic,
      component: SettingsVoice,
      translateKey: 'voice',
    },
    {
      id: 'config',
      name: t('settings.config'),
      description: t('settings.configDescription'),
      icon: Folder,
      component: SettingsCoreConfig,
      translateKey: 'config',
    },
    {
      id: 'extensions',
      name: t('settings.extensions'),
      description: t('settings.extensionsDescription'),
      icon: Puzzle,
      translateKey: 'extensions',
    },
    {
      id: 'notifications',
      name: t('settings.notifications'),
      description: t('settings.notificationsDescription'),
      icon: Bell,
      translateKey: 'notifications',
    },
    {
      id: 'privacy',
      name: t('settings.privacy'),
      description: t('settings.privacyDescription'),
      icon: Shield,
      translateKey: 'privacy',
    },
    {
      id: 'about',
      name: t('settings.about'),
      description: t('settings.aboutDescription'),
      icon: Info,
      translateKey: 'about',
    },
    {
      id: 'advanced',
      name: t('settings.advanced'),
      description: t('settings.advancedDescription'),
      icon: Cpu,
      component: SettingsAdvanced,
      translateKey: 'advanced',
    },
  ];
};

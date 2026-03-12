import type { SettingsSectionAccent } from './types';

export const sectionAccentMap: Record<string, SettingsSectionAccent> = {
  general: {
    bg: 'rgba(59, 130, 246, 0.12)',
    icon: '#60A5FA',
    glow: 'rgba(96, 165, 250, 0.22)',
  },
  channels: {
    bg: 'rgba(20, 184, 166, 0.12)',
    icon: '#2DD4BF',
    glow: 'rgba(45, 212, 191, 0.22)',
  },
  voice: {
    bg: 'rgba(139, 92, 246, 0.12)',
    icon: '#A78BFA',
    glow: 'rgba(167, 139, 250, 0.22)',
  },
  config: {
    bg: 'rgba(249, 115, 22, 0.12)',
    icon: '#FB923C',
    glow: 'rgba(251, 146, 60, 0.22)',
  },
  extensions: {
    bg: 'rgba(236, 72, 153, 0.12)',
    icon: '#F472B6',
    glow: 'rgba(244, 114, 182, 0.22)',
  },
  notifications: {
    bg: 'rgba(245, 158, 11, 0.12)',
    icon: '#FBBF24',
    glow: 'rgba(251, 191, 36, 0.22)',
  },
  privacy: {
    bg: 'rgba(34, 197, 94, 0.12)',
    icon: '#4ADE80',
    glow: 'rgba(74, 222, 128, 0.22)',
  },
  about: {
    bg: 'rgba(148, 163, 184, 0.12)',
    icon: '#CBD5E1',
    glow: 'rgba(203, 213, 225, 0.18)',
  },
  advanced: {
    bg: 'rgba(244, 63, 94, 0.12)',
    icon: '#FB7185',
    glow: 'rgba(251, 113, 133, 0.22)',
  },
};

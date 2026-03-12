export interface CronManifestOption {
  label: string;
  value: string;
}

export interface CronManifestCommand {
  id: string;
  label: string;
  command: string;
  subcommands: string[];
}

export interface CronManifestField {
  id: string;
  label: string;
  type: 'readonly' | 'text' | 'number' | 'select' | 'password';
  path?: string;
  source?: string;
  defaultValue?: string | number;
  options?: CronManifestOption[];
}

export interface CronManifestSection {
  id: string;
  title: string;
  description: string;
  fields: CronManifestField[];
  commands: CronManifestCommand[];
}

export const cronSessionTargetOptions: CronManifestOption[] = [
  {
    label: 'main',
    value: 'main',
  },
  {
    label: 'isolated',
    value: 'isolated',
  },
];

export const cronWakeModeOptions: CronManifestOption[] = [
  {
    label: 'now',
    value: 'now',
  },
  {
    label: 'next-heartbeat',
    value: 'next-heartbeat',
  },
];

export const cronScheduleKindOptions: CronManifestOption[] = [
  {
    label: 'at',
    value: 'at',
  },
  {
    label: 'every',
    value: 'every',
  },
  {
    label: 'cron',
    value: 'cron',
  },
];

export const cronPayloadKindOptions: CronManifestOption[] = [
  {
    label: 'systemEvent',
    value: 'systemEvent',
  },
  {
    label: 'agentTurn',
    value: 'agentTurn',
  },
];

export const cronThinkingOptions: CronManifestOption[] = [
  {
    label: 'off',
    value: 'off',
  },
  {
    label: 'minimal',
    value: 'minimal',
  },
  {
    label: 'low',
    value: 'low',
  },
  {
    label: 'medium',
    value: 'medium',
  },
  {
    label: 'high',
    value: 'high',
  },
  {
    label: 'xhigh',
    value: 'xhigh',
  },
];

export const cronDeliveryChannelOptions: CronManifestOption[] = [
  {
    label: 'last',
    value: 'last',
  },
  {
    label: 'whatsapp',
    value: 'whatsapp',
  },
  {
    label: 'telegram',
    value: 'telegram',
  },
  {
    label: 'discord',
    value: 'discord',
  },
  {
    label: 'slack',
    value: 'slack',
  },
  {
    label: 'mattermost',
    value: 'mattermost',
  },
  {
    label: 'signal',
    value: 'signal',
  },
  {
    label: 'imessage',
    value: 'imessage',
  },
];

export const cronCommandDefinitions: CronManifestCommand[] = [
  {
    id: 'cronList',
    label: 'Cron List',
    command: 'openclaw',
    subcommands: ['cron', 'list', '--all', '--json'],
  },
  {
    id: 'cronStatus',
    label: 'Cron Status',
    command: 'openclaw',
    subcommands: ['cron', 'status', '--json'],
  },
  {
    id: 'cronAddAtSystemEvent',
    label: 'Create One-Time System Event',
    command: 'openclaw',
    subcommands: ['cron', 'add', '--name', '<name>', '--at', '<time>', '--session', 'main', '--system-event', '<text>', '--wake', 'now', '--delete-after-run'],
  },
  {
    id: 'cronAddRecurringAgentTurn',
    label: 'Create Recurring Agent Turn',
    command: 'openclaw',
    subcommands: ['cron', 'add', '--name', '<name>', '--cron', '0 7 * * *', '--session', 'isolated', '--message', '<text>', '--announce', '--channel', 'telegram', '--to', '<target>'],
  },
  {
    id: 'cronEdit',
    label: 'Edit Job',
    command: 'openclaw',
    subcommands: ['cron', 'edit', '<jobId>', '--message', '<text>', '--thinking', 'low'],
  },
  {
    id: 'cronEnable',
    label: 'Enable Job',
    command: 'openclaw',
    subcommands: ['cron', 'enable', '<jobId>'],
  },
  {
    id: 'cronDisable',
    label: 'Disable Job',
    command: 'openclaw',
    subcommands: ['cron', 'disable', '<jobId>'],
  },
  {
    id: 'cronRun',
    label: 'Run Job Now',
    command: 'openclaw',
    subcommands: ['cron', 'run', '<jobId>', '--due'],
  },
  {
    id: 'cronRuns',
    label: 'Run History',
    command: 'openclaw',
    subcommands: ['cron', 'runs', '--id', '<jobId>', '--limit', '10'],
  },
  {
    id: 'cronRemove',
    label: 'Remove Job',
    command: 'openclaw',
    subcommands: ['cron', 'rm', '<jobId>'],
  },
];

export const cronManifestSection: CronManifestSection = {
  id: 'cron',
  title: 'Cron',
  description: '管理 Gateway scheduler、cron.jobs 默认行为、run log 保留与 Webhook 交付设置。',
  fields: [
    {
      id: 'cronSessionRetention',
      label: 'Cron Session Retention',
      type: 'text',
      path: 'cron.sessionRetention',
      defaultValue: '24h',
    },
    {
      id: 'cronRunLogMaxBytes',
      label: 'Cron Run Log Max Bytes',
      type: 'number',
      path: 'cron.runLog.maxBytes',
      defaultValue: 1048576,
    },
    {
      id: 'cronRunLogKeepLines',
      label: 'Cron Run Log Keep Lines',
      type: 'number',
      path: 'cron.runLog.keepLines',
      defaultValue: 2000,
    },
    {
      id: 'cronWebhook',
      label: 'Cron Webhook',
      type: 'text',
      path: 'cron.webhook',
      defaultValue: '',
    },
    {
      id: 'cronWebhookToken',
      label: 'Cron Webhook Token',
      type: 'password',
      path: 'cron.webhookToken',
      defaultValue: '',
    },
    {
      id: 'cronJobs',
      label: 'Cron Jobs',
      type: 'text',
      path: 'cron.jobs',
      defaultValue: '',
    },
  ],
  commands: cronCommandDefinitions,
};

export const getCronCommandPreview = () => {
  return cronCommandDefinitions.map((item) => [item.command, ...item.subcommands].join(' '));
};

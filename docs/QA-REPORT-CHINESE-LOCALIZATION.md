# OpenClaw Desktop 汉化覆盖率验证报告
**验证时间：** 2026-03-23  
**验证范围：** 全系统用户可见文本、翻译文件、UI组件  
**总体覆盖率：** 93.04%
---
## 一、翻译文件校验结果
### 1. 基础统计
| 指标 | 数值 |
|------|------|
| 总英文翻译键数 | 848 |
| 已汉化中文键数 | 789 |
| 未汉化键数 | 60 |
| 多余中文键数 | 1 |
| 技术术语保留（合理） | 5 |

### 2. 缺失的中文翻译（共60个）
| 翻译键 | 英文原文 |
|--------|----------|
| config.title | Configuration |
| config.subtitle | Manage your OpenClaw settings |
| config.loading | Loading configuration... |
| config.addField | Add Field |
| config.noFields | No configuration fields found |
| config.addFirstField | Add your first field |
| config.saving | Saving... |
| config.save | Save Configuration |
| config.saveSuccess | Configuration saved successfully! |
| config.confirmDelete | Are you sure you want to delete "{key}"? |
| config.enterFieldName | Enter field name: |
| config.typeBoolean | boolean |
| config.typeNumber | number |
| config.typeString | string |
| agents.configured | Configured |
| agents.token | Token |
| agents.id | ID |
| agents.workspace | Workspace |
| agents.noAgents | No Agents Found |
| agents.selectAgent | Select an Agent |
| agents.cpu | CPU |
| agents.memory | Memory |
| tasks.newCron | New cron job |
| tasks.basics | Basics |
| tasks.name | Name |
| tasks.namePlaceholder | Required (e.g. "Daily summary") |
| tasks.description | Description |
| tasks.descriptionPlaceholder | Optional notes |
| tasks.agentId | Agent ID |
| tasks.enabled | Enabled |
| tasks.sessionTarget | Session target |
| tasks.wakeMode | Wake mode |
| tasks.schedule | Schedule |
| tasks.kind | Kind |
| tasks.payload | Payload |
| tasks.delivery | Delivery |
| tasks.kindHint | "At" for one-time, "Every" for interval, "Cron" for 5-field expression. |
| tasks.systemEventText | System event text |
| tasks.message | Message |
| tasks.thinking | Thinking |
| tasks.optional | Optional |
| tasks.timeout | Timeout |
| tasks.channel | Channel |
| tasks.to | To |
| workspace.path | Workspace Path |
| workspace.memoryPath | Memory Path |
| workspace.agentConfigPath | Agent Config Path |
| workspace.sessionsPath | Sessions Path |
| workspace.root | Workspace Root |
| workspace.agentConfigRoot | Agent Config Root |
| workspace.configSource | Config Source |
| settings.coreConfig.title | Core Config |
| settings.coreConfig.authCooldowns | Auth Cooldowns |
| settings.coreConfig.authProfileOrder | Auth Profile Order |
| settings.coreConfig.authProfiles | Auth Profiles |
| settings.coreConfig.provider | Provider |
| settings.coreConfig.primaryAgentPlaceholder | Primary Agent |
| instances.cpu | CPU |
| instances.memory | Memory |
| instances.port | Port |

### 3. 多余中文翻译键（需同步）
| 翻译键 | 中文内容 | 处理建议 |
|--------|----------|----------|
| common.filter | 筛选 | 同步添加到英文翻译中，确认使用场景 |

### 4. 技术术语保留（合理无需汉化）
| 术语 | 说明 |
|------|------|
| Gravatar | 通用头像服务名称，行业通用 |
| Emoji | 表情符号通用术语 |
| tokens | AI行业通用术语 |
| ClawHub | OpenClaw官方技能市场名称 |
| API Key | 技术通用术语 |

---
## 二、UI硬编码未汉化字符串校验结果
共发现5处硬编码在组件中的英文文本，未使用翻译系统：
| 位置 | 英文原文 | 组件路径 |
|------|----------|----------|
| 通用设置-偏好项 | Launch at login | pages/settings/general/PreferencesSection.tsx |
| 通用设置-偏好项 | Show Dock icon | pages/settings/general/PreferencesSection.tsx |
| 通用设置-偏好项 | Enable debug tools | pages/settings/general/PreferencesSection.tsx |
| 通用设置-权限项 | Allow Canvas | pages/settings/general/PermissionsSection.tsx |
| 通用设置-权限项 | Enable Peekaboo Bridge | pages/settings/general/PermissionsSection.tsx |

---
## 三、验收结论
❌ **当前未达到100%汉化覆盖率要求**，共存在65处待修复问题：
1. 60个缺失的翻译键需要补充中文翻译
2. 1个多余翻译键需要同步到英文
3. 5处硬编码字符串需要替换为翻译调用

**修复建议优先级：**
- P0：补充所有缺失的翻译键（影响配置页、任务页、实例页、智能体页核心功能展示）
- P1：修复硬编码UI字符串（影响设置页用户理解）
- P2：同步多余翻译键到英文翻译文件

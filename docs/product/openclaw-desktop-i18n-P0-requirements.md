# OpenClaw Desktop P0 界面汉化需求清单
> project-name: openclaw-desktop
> status: approved
> priority: P0
> due-date: 2026-03-24

---

## 一、通用保留技术术语清单（无需翻译）
以下术语统一保留英文原文，所有页面通用：
```
API、CLI、SDK、JSON、YAML、Markdown、Git、GitHub、OAuth、JWT、
Agent、Skill、Session、Instance、Gateway、Node、Workspace、
Token、Key、Secret、URL、HTTP、HTTPS、WebSocket、
CPU、RAM、Disk、PID、Port、Host、IP、DNS、
GPT、LLM、Token（AI语义下）、Prompt、Temperature、Top_p、
OpenClaw、Figma、Miro、Excalidraw、1Password、
Docker、Kubernetes、VPS、SSH、Tailscale
```

---

## 二、P0核心演示界面汉化需求
按页面分类，优先级标注P0（必须在演示前完成）：

### 📄 【P0】技能管理页面（/skills）
| 英文原文 | 中文翻译 | 页面位置 |
|----------|----------|----------|
| Skills | 技能市场 | 页面标题 |
| Manage skills and capabilities for your agents | 管理所有可用于Agent的技能与能力扩展 | 页面副标题 |
| Install | 安装 | 操作按钮 |
| Uninstall | 卸载 | 操作按钮 |
| Update | 更新 | 操作按钮 |
| Enable | 启用 | 操作按钮 |
| Disable | 禁用 | 操作按钮 |
| Upload | 上传 | 操作按钮 |
| Search skills... | 搜索技能... | 搜索框占位符 |
| All Categories | 全部分类 | 分类筛选 |
| Sort by Name | 按名称排序 | 排序选项 |
| Sort by Updated | 按更新时间排序 | 排序选项 |
| Total | 总数 | 统计标签 |
| Installed | 已安装 | 统计标签 |
| Updatable | 可更新 | 统计标签 |
| Enabled | 已启用 | 统计标签 |
| No Skills Found | 未找到技能 | 空状态标题 |
| No skills are available or installed | 当前没有可用或已安装的技能 | 空状态描述 |
| No skills match your search criteria | 没有符合搜索条件的技能 | 过滤空状态 |
| Clear Filters | 清除筛选 | 空状态操作 |
| Version | 版本 | 技能属性 |
| Author | 作者 | 技能属性 |
| Downloads: {count} | 下载量：{count} | 技能属性 |
| Updated: {date} | 更新时间：{date} | 技能属性 |
| Open directory | 打开目录 | 操作按钮 |
| Installed | 已安装 | 状态标签 |
| Available | 可安装 | 状态标签 |
| Update Available | 可更新 | 状态标签 |
| Error | 加载失败 | 状态标签 |
| Are you sure you want to uninstall this skill? | 确认要卸载该技能吗？ | 卸载确认弹窗 |
| Failed to load skills | 技能加载失败 | 错误提示 |
| Failed to connect to skill registry | 无法连接到技能仓库 | 错误提示 |
| Failed to install skill | 技能安装失败 | 错误提示 |
| Failed to uninstall skill | 技能卸载失败 | 错误提示 |
| Failed to update skill | 技能更新失败 | 错误提示 |
| Failed to enable skill | 技能启用失败 | 错误提示 |
| Failed to disable skill | 技能禁用失败 | 错误提示 |

---

### 🤖 【P0】Agent管理页面（/agents）
| 英文原文 | 中文翻译 | 页面位置 |
|----------|----------|----------|
| Agents | Agent管理 | 页面标题 |
| Create New Agent | 新建Agent | 操作按钮 |
| Import Agent | 导入Agent | 操作按钮 |
| Export Agent | 导出Agent | 操作按钮 |
| Export History | 导出历史 | 操作按钮 |
| Delete Agent | 删除Agent | 操作按钮 |
| Are you sure you want to delete this agent? | 确认要删除该Agent吗？该操作不可恢复。 | 删除确认弹窗 |
| Agent Name | Agent名称 | 表单字段 |
| Agent Description | Agent描述 | 表单字段 |
| Model | 模型 | 表单字段 |
| Temperature | 温度系数 | 表单字段 |
| System Prompt | 系统提示词 | 表单字段 |
| Skills | 关联技能 | 表单字段 |
| Permissions | 权限配置 | 表单字段 |
| Running | 运行中 | 状态标签 |
| Stopped | 已停止 | 状态标签 |
| Error | 异常 | 状态标签 |
| Sessions | 会话数 | 统计字段 |
| Messages | 消息数 | 统计字段 |
| Token Usage | Token用量 | 统计字段 |
| Avg Response Time | 平均响应时间 | 统计字段 |
| Clone Agent | 克隆Agent | 操作按钮 |
| View Details | 查看详情 | 操作按钮 |
| Settings | 配置 | 操作按钮 |
| No Agents Found | 未找到Agent | 空状态标题 |
| Create your first agent to get started | 创建你的第一个Agent开始使用 | 空状态描述 |
| Create Agent | 创建Agent | 操作按钮 |
| Agent created successfully | Agent创建成功 | 成功提示 |
| Agent updated successfully | Agent更新成功 | 成功提示 |
| Agent deleted successfully | Agent删除成功 | 成功提示 |
| Failed to load agents | Agent加载失败 | 错误提示 |
| Failed to create agent | Agent创建失败 | 错误提示 |
| Failed to update agent | Agent更新失败 | 错误提示 |
| Failed to delete agent | Agent删除失败 | 错误提示 |
| Agent Enhancement | Agent增强 | 标签页 |
| Performance Metrics | 性能指标 | 模块标题 |
| CPU Usage | CPU使用率 | 指标 |
| Memory Usage | 内存使用率 | 指标 |
| Tokens/sec | Token生成速度 | 指标 |
| Response Time | 响应时间 | 指标 |
| Error Rate | 错误率 | 指标 |
| Uptime | 运行时长 | 指标 |
| Active Sessions | 活跃会话 | 指标 |
| Total Messages | 总消息数 | 指标 |
| Save Settings | 保存配置 | 操作按钮 |
| Debug Terminal | 调试终端 | 操作按钮 |
| Export Config | 导出配置 | 操作按钮 |
| Import Config | 导入配置 | 操作按钮 |
| Restart Agent | 重启Agent | 操作按钮 |
| Security Check | 安全检查 | 操作按钮 |

---

### 💬 【P0】对话/会话页面（/sessions）
| 英文原文 | 中文翻译 | 页面位置 |
|----------|----------|----------|
| Sessions | 会话中心 | 页面标题 |
| New Chat | 新建对话 | 操作按钮 |
| Delete Session | 删除会话 | 操作按钮 |
| Clear History | 清空历史 | 操作按钮 |
| Search conversations... | 搜索对话... | 搜索框占位符 |
| Today | 今天 | 时间分组 |
| Yesterday | 昨天 | 时间分组 |
| Last 7 Days | 近7天 | 时间分组 |
| Earlier | 更早 | 时间分组 |
| No conversations yet | 还没有对话 | 空状态标题 |
| Start a new conversation with your agent | 选择一个Agent开始新的对话 | 空状态描述 |
| Send a message... | 发送消息... | 输入框占位符 |
| Attach file | 附件 | 输入框按钮 |
| Voice input | 语音输入 | 输入框按钮 |
| Stop generating | 停止生成 | 操作按钮 |
| Regenerate response | 重新生成回复 | 操作按钮 |
| Copy message | 复制消息 | 操作按钮 |
| Delete message | 删除消息 | 操作按钮 |
| Export chat | 导出对话 | 操作按钮 |
| Are you sure you want to delete this session? | 确认要删除该会话吗？所有消息记录将被清空。 | 删除确认弹窗 |
| Are you sure you want to clear all conversation history? | 确认要清空所有对话历史吗？该操作不可恢复。 | 清空确认弹窗 |
| Session deleted successfully | 会话删除成功 | 成功提示 |
| History cleared successfully | 历史清空成功 | 成功提示 |
| Failed to send message | 消息发送失败 | 错误提示 |
| Failed to load conversation | 对话加载失败 | 错误提示 |
| Model response timeout | 模型响应超时，请重试 | 错误提示 |
| Uploading file... | 正在上传文件... | 状态提示 |
| File uploaded successfully | 文件上传成功 | 成功提示 |
| File upload failed | 文件上传失败 | 错误提示 |
| File size exceeds limit (max 100MB) | 文件大小超出限制（最大100MB） | 错误提示 |

---

### ⚙️ 【P0】设置页面（/settings）
| 英文原文 | 中文翻译 | 页面位置 |
|----------|----------|----------|
| Settings | 设置中心 | 页面标题 |
| General | 通用设置 | 左侧菜单 |
| Startup, appearance, language, and tray settings | 启动项、外观、语言、托盘设置 | 菜单描述 |
| Channels | 渠道配置 | 左侧菜单 |
| Manage connected messaging platforms | 管理已接入的消息平台 | 菜单描述 |
| Models | 模型配置 | 左侧菜单 |
| Manage AI model providers and API keys | 管理AI模型供应商与API密钥 | 菜单描述 |
| Voice | 语音唤醒 | 左侧菜单 |
| Voice activation and wake word settings | 语音激活与唤醒词设置 | 菜单描述 |
| Advanced | 高级设置 | 左侧菜单 |
| System, network, and debug configurations | 系统、网络、调试配置 | 菜单描述 |
| Theme | 主题 | 通用设置项 |
| Light | 浅色 | 主题选项 |
| Dark | 深色 | 主题选项 |
| System | 跟随系统 | 主题选项 |
| Language | 语言 | 通用设置项 |
| Chinese (Simplified) | 简体中文 | 语言选项 |
| English | 英文 | 语言选项 |
| Startup | 启动设置 | 通用设置项 |
| Launch on system startup | 开机自动启动 | 开关选项 |
| Minimize to tray on close | 关闭时最小化到托盘 | 开关选项 |
| Run in background on startup | 启动时后台运行 | 开关选项 |
| Save | 保存 | 操作按钮 |
| Cancel | 取消 | 操作按钮 |
| Reset to defaults | 恢复默认设置 | 操作按钮 |
| Settings saved successfully | 设置保存成功 | 成功提示 |
| Failed to save settings | 设置保存失败 | 错误提示 |
| Add Channel | 添加渠道 | 渠道页操作 |
| Edit Channel | 编辑渠道 | 渠道页操作 |
| Delete Channel | 删除渠道 | 渠道页操作 |
| Channel Name | 渠道名称 | 表单字段 |
| API Key | API密钥 | 表单字段 |
| API Endpoint | API地址 | 表单字段 |
| Model List | 模型列表 | 表单字段 |
| Enabled | 已启用 | 状态标签 |
| Disabled | 已禁用 | 状态标签 |
| Test Connection | 测试连接 | 操作按钮 |
| Connection successful | 连接成功 | 成功提示 |
| Connection failed | 连接失败 | 错误提示 |
| Invalid API Key | API密钥无效 | 错误提示 |
| Add Model | 添加模型 | 模型页操作 |
| Edit Model | 编辑模型 | 模型页操作 |
| Delete Model | 删除模型 | 模型页操作 |
| Model Name | 模型名称 | 表单字段 |
| Provider | 供应商 | 表单字段 |
| API Base URL | API根地址 | 表单字段 |
| Default Model | 默认模型 | 开关选项 |
| Enable voice wake | 启用语音唤醒 | 语音页开关 |
| Listen for a wake phrase before starting voice capture | 启动语音捕获前先监听唤醒词 | 开关描述 |
| Hold right Option to talk | 按住右Option键说话 | 语音页开关 |
| Use push-to-talk when you want tighter control in busy environments | 在嘈杂环境下使用按键说话获得更精准的控制 | 开关描述 |
| Recognition language | 识别语言 | 语音页设置项 |
| Select primary language | 选择主语言 | 下拉占位符 |
| Wake words | 唤醒词 | 语音页设置项 |
| Push to talk | 按键说话 | 交互模式选项 |
| Hands-free | 免提 | 交互模式选项 |

---

## 三、实施要求
1. 所有翻译需符合国内用户使用习惯，避免生硬机翻
2. 技术术语严格按照本清单保留英文，不得翻译
3. 翻译完成后需在所有核心页面走查一遍，确保无遗漏、无翻译错误
4. P0部分需在2026-03-24 00:44前完成并合并到主分支，用于演示
5. 次要页面（如日志、实例、任务页等）后续迭代补充，优先级P1
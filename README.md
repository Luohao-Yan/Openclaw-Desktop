# openclaw-desktop - SKILL 包安装指南项目

## 项目概述

本项目为 openclaw-desktop 提供完整的自定义 SKILL 包安装操作指南，包含从手动安装到前端关联的全流程文档和自动化脚本。

## 项目结构

```
openclaw-desktop/
├── docs/
│   └── CUSTOM_SKILL_INSTALLATION_GUIDE.md    # 完整安装指南文档
├── scripts/
│   ├── install_skill.sh                     # 快速安装脚本
│   └── verify_skill_install.sh              # 验证脚本
└── README.md                                 # 本文件
```

## 核心文档

### CUSTOM_SKILL_INSTALLATION_GUIDE.md

完整的操作指南，包含以下内容：

1. **手动安装步骤**
   - 确认 Agent Workspace 路径
   - 创建 SKILL 目录结构
   - 复制 SKILL.md 和辅助文件
   - 设置执行权限

2. **SKILL 配置加载方法**
   - SKILL 加载机制说明
   - SKILL.md 关键字段说明
   - Agent 配置方法
   - 强制重载方法

3. **验证 SKILL 安装**
   - 文件系统验证
   - 功能测试方法
   - 日志验证
   - 自动化验证脚本使用

4. **前端关联配置**
   - SKILL-Agent 关联机制
   - openclaw-desktop 配置界面操作
   - 配置文件编辑方法
   - API 验证方法

5. **常见问题排查**
   - SKILL 无法识别
   - 脚本权限问题
   - 跨 Agent 共享
   - 依赖工具缺失
   - SKILL 未被调用

## 使用方法

### 快速开始

1. **阅读完整指南**
   ```bash
   cat docs/CUSTOM_SKILL_INSTALLATION_GUIDE.md
   ```

2. **安装自定义 SKILL**
   ```bash
   ./scripts/install_skill.sh <agent-name> <skill-name> <source-path>
   ```

   示例：
   ```bash
   ./scripts/install_skill.sh fullstack-dev my-skill /tmp/my-skill-package
   ```

3. **验证安装**
   ```bash
   ./scripts/verify_skill_install.sh <agent-name> <skill-name>
   ```

   示例：
   ```bash
   ./scripts/verify_skill_install.sh fullstack-dev my-skill
   ```

## 脚本说明

### install_skill.sh

自动将自定义 SKILL 包安装到指定 Agent Workspace。

**功能：**
- 验证源路径和必需文件
- 创建目标目录结构
- 复制所有文件
- 自动设置脚本执行权限
- 验证安装结果
- 可选立即运行验证

**使用示例：**
```bash
./scripts/install_skill.sh fullstack-dev weather-service ./weather-skill
```

### verify_skill_install.sh

验证 SKILL 是否正确安装并可被 Agent 识别。

**检查项：**
- Agent Workspace 存在性
- SKILL 目录结构
- SKILL.md 存在和内容
- 必需字段完整性
- 脚本执行权限
- 引用文档完整性
- OpenClaw Gateway 状态

**使用示例：**
```bash
./scripts/verify_skill_install.sh fullstack-dev weather-service
```

## 适用场景

本指南适用于以下场景：

1. **开发新 SKILL**
   - 将本地开发的 SKILL 安装到测试 Agent
   - 验证 SKILL 功能
   - 调试 SKILL 加载问题

2. **部署生产 SKILL**
   - 将已验证的 SKILL 部署到生产 Agent
   - 确保配置正确
   - 验证依赖关系

3. **多 Agent 共享**
   - 将通用 SKILL 安装到多个 Agent
   - 使用符号链接或复制方式共享
   - 统一管理和更新

4. **SKILL 维护**
   - 更新现有 SKILL
   - 修复 SKILL 问题
   - 优化 SKILL 性能

## 前置条件

- 已安装 OpenClaw Gateway
- 已创建目标 Agent
- 已准备好自定义 SKILL 包（包含 SKILL.md）
- 了解 Agent Workspace 路径规范

## 验收标准

✅ 提供清晰的分步操作指南
✅ 包含具体路径示例和命令
✅ 包含验证步骤
✅ 提供自动化脚本简化操作
✅ 涵盖常见问题排查方案

## 相关资源

- OpenClaw 官方文档
- SKILL 开发规范
- Agent 配置参考
- openclaw-desktop 用户手册

## 反馈与支持

如遇到问题或需要帮助：

1. 查看文档中的「常见问题排查」章节
2. 运行验证脚本诊断问题
3. 查看 OpenClaw Gateway 日志
4. 联系技术支持

## 版本历史

- **v1.0** (2026-03-23)
  - 初始版本
  - 完整安装指南文档
  - 安装和验证脚本
  - 常见问题排查

---

_项目维护者: fullstack-dev_
_最后更新: 2026-03-23_

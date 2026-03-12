# OpenClaw Desktop

OpenClaw Desktop 是一个 Electron 桌面应用，用于管理 OpenClaw Gateway。

## 功能

- **Dashboard**: 查看 Gateway 状态，启动/停止/重启 Gateway
- **Config**: 管理 OpenClaw 配置文件
- **Tasks**: 监控运行中的任务
- **Logs**: 查看 Gateway 日志

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建应用
npm run build:mac
```

## 技术栈

- Electron 28+
- React 18
- TypeScript
- Tailwind CSS
- Vite

## 项目结构

```
openclaw-desktop/
├── electron/          # Electron 主进程
│   ├── main.ts       # 主进程入口
│   ├── preload.ts    # 预加载脚本
│   └── ipc/          # IPC 处理
├── src/              # React 前端
│   ├── components/   # 组件
│   ├── pages/        # 页面
│   └── ...
└── ...
```

## 注意事项

所有功能都使用真实的 OpenClaw CLI 调用：
- Gateway 控制: `openclaw gateway start/stop/status`
- 配置管理: 读写 `~/.openclaw/config.yaml`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Luohao-Yan/Openclaw-Desktop&type=Date)](https://www.star-history.com/?repos=Luohao-Yan%2FOpenclaw-Desktop&type=date&legend=top-left)

## Contributors

本项目衍生自 [openclaw/openclaw](https://github.com/openclaw/openclaw)，感谢原项目的贡献者们。

[![Contributors](https://contrib.rocks/image?repo=Luohao-Yan/Openclaw-Desktop)](https://github.com/Luohao-Yan/Openclaw-Desktop/graphs/contributors)

## License

本项目使用 `GNU Affero General Public License v3.0` (`AGPL-3.0`)。

这意味着如果你修改本项目并对外分发，或将修改后的版本作为网络服务提供给其他用户使用，你需要按照 AGPL-3.0 的要求公开对应源码。

详细条款请参见仓库根目录下的 `LICENSE` 文件。

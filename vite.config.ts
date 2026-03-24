import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // 使用相对路径，确保 Electron 打包后在 file:// 协议下资源引用正确（./assets/... 而非 /assets/...）
  base: './',
  plugins: [react()],
  server: {
    // 开发服务器端口（仅此一处定义，其他文件通过环境变量或默认值同步）
    port: 51741,
    strictPort: true,
    // 仅监听本地，不自动打开浏览器（Electron 会加载此地址）
    open: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});

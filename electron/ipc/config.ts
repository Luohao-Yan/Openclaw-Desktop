import pkg from 'electron';
const { ipcMain } = pkg;
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import path from 'path';
import { getOpenClawRootDir } from './settings.js';
import { migrateBindingsSchema } from './coreConfig.js';

const getConfigPath = () => path.join(getOpenClawRootDir(), 'openclaw.json');

export function setupConfigIPC() {
  ipcMain.handle('config:get', async () => {
    try {
      const configPath = getConfigPath();
      if (!existsSync(configPath)) {
        return { success: false, error: `Config file not found: ${configPath}` };
      }
      const content = readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      return { success: true, config, path: configPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:set', async (_, config) => {
    try {
      const configPath = getConfigPath();
      const configDir = path.dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // 备份
      if (existsSync(configPath)) {
        const backupPath = `${configPath}.backup.${Date.now()}`;
        copyFileSync(configPath, backupPath);
      }

      // 移除 OpenClaw v0.3.24+ schema 不支持的根级别字段，避免校验失败
      const sanitized = { ...config };
      delete sanitized.pairing;

      // 执行 bindings schema 迁移，清理 enabled 等不兼容字段（防御层）
      const migrated = migrateBindingsSchema(sanitized);
      
      // 写入新配置
      const jsonContent = JSON.stringify(migrated, null, 2);
      writeFileSync(configPath, jsonContent, 'utf8');
      
      return { success: true, path: configPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
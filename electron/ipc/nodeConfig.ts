import pkg from 'electron';
const { ipcMain } = pkg;
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import path from 'path';
import { getOpenClawRootDir } from './settings.js';

const getNodeConfigPath = () => path.join(getOpenClawRootDir(), 'node.json');

interface NodeConfigShape {
  gateway?: {
    host?: string;
    port?: number;
  };
}

const readNodeConfig = (): NodeConfigShape => {
  const configPath = getNodeConfigPath();
  try {
    if (!existsSync(configPath)) {
      return {};
    }

    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content) as NodeConfigShape;
  } catch {
    return {};
  }
};

const writeNodeConfig = (config: NodeConfigShape) => {
  const configPath = getNodeConfigPath();
  const configDir = path.dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (existsSync(configPath)) {
    const backupPath = `${configPath}.backup.${Date.now()}`;
    copyFileSync(configPath, backupPath);
  }

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
};

export function setupNodeConfigIPC() {
  ipcMain.handle('nodeConfig:get', async () => {
    try {
      const configPath = getNodeConfigPath();
      const config = readNodeConfig();
      return { success: true, config, path: configPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('nodeConfig:set', async (_, config: NodeConfigShape) => {
    try {
      const nextConfig: NodeConfigShape = {
        ...(config || {}),
        gateway: {
          ...(config?.gateway || {}),
        },
      };

      const configPath = writeNodeConfig(nextConfig);
      return { success: true, path: configPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

export function setupScreenshotIPC() {
  ipcMain.handle('screenshot:take', async (_event, filename: string) => {
    const { BrowserWindow } = require('electron');
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      try {
        const image = await window.webContents.capturePage();
        const screenshotPath = path.join(__dirname, '../..', 'docs', 'assets', 'screenshots', filename);
        const screenshotsDir = path.dirname(screenshotPath);
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        fs.writeFileSync(screenshotPath, image.toPNG());
        console.log(`Screenshot saved to ${screenshotPath}`);
        return { success: true, path: screenshotPath };
      } catch (error) {
        console.error('Failed to take screenshot:', error);
        return { success: false, error: error };
      }
    } else {
      console.error('No focused window found');
      return { success: false, error: 'No focused window' };
    }
  });

  ipcMain.handle('screenshot:navigateAndTake', async (_event, route: string, filename: string) => {
    const { BrowserWindow } = require('electron');
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      try {
        const url = `http://localhost:5174/#${route}`;
        await window.loadURL(url);
        await new Promise(resolve => window.webContents.once('dom-ready', resolve));
        await new Promise(resolve => setTimeout(resolve, 2000));
        const image = await window.webContents.capturePage();
        const screenshotPath = path.join(__dirname, '../..', 'docs', 'assets', 'screenshots', filename);
        const screenshotsDir = path.dirname(screenshotPath);
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        fs.writeFileSync(screenshotPath, image.toPNG());
        console.log(`Screenshot saved to ${screenshotPath}`);
        return { success: true, path: screenshotPath };
      } catch (error) {
        console.error('Failed to take screenshot:', error);
        return { success: false, error: error };
      }
    } else {
      console.error('No focused window found');
      return { success: false, error: 'No focused window' };
    }
  });
}

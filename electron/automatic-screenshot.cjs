const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

async function takeScreenshot(window, filename) {
  return new Promise((resolve, reject) => {
    window.webContents.capturePage().then(image => {
      const screenshotPath = path.join(__dirname, '../..', 'docs', 'assets', 'screenshots', filename);
      fs.writeFile(screenshotPath, image.toPNG(), err => {
        if (err) {
          reject(err);
        } else {
          console.log(`Screenshot saved to ${screenshotPath}`);
          resolve();
        }
      });
    }).catch(err => {
      reject(err);
    });
  });
}

async function navigateAndScreenshot(window, route, filename) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:5174/#${route}`;
    window.loadURL(url).then(() => {
      window.webContents.once('did-finish-load', async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await takeScreenshot(window, filename);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }).catch(err => {
      reject(err);
    });
  });
}

async function takeAllScreenshots() {
  try {
    // 获取当前的 BrowserWindow
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      console.error('No window found');
      return;
    }
    const mainWindow = windows[0];

    // 检查页面是否已经加载完成
    if (!mainWindow.webContents) {
      console.error('No webContents');
      return;
    }

    // 截图各个页面
    const pages = [
      { route: '', filename: '01-启动页.png' },
      { route: '', filename: '02-工作台.png' },
      { route: '/skills', filename: '03-技能管理.png' },
      { route: '/agents', filename: '04-Agent管理.png' },
      { route: '/sessions', filename: '05-对话聊天.png' },
      { route: '/settings', filename: '06-设置.png' }
    ];

    for (const page of pages) {
      console.log(`Taking screenshot of ${page.route} as ${page.filename}`);
      await navigateAndScreenshot(mainWindow, page.route, page.filename);
    }

    console.log('所有截图已保存');
  } catch (error) {
    console.error('截图过程中出错：', error);
  }
}

// 延迟执行，确保页面已经加载完成
setTimeout(() => {
  takeAllScreenshots();
}, 5000);

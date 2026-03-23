const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function takeScreenshot(window, filename) {
  return new Promise((resolve, reject) => {
    window.webContents.capturePage().then(image => {
      const screenshotPath = path.join(__dirname, 'docs', 'assets', 'screenshots', filename);
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
      window.webContents.once('dom-ready', () => {
        setTimeout(async () => {
          try {
            await takeScreenshot(window, filename);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 2000);
      });
    }).catch(err => {
      reject(err);
    });
  });
}

app.whenReady().then(async () => {
  // 创建一个隐藏的窗口，用于导航和截图
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  try {
    // 启动页
    await navigateAndScreenshot(window, '', '01-启动页.png');

    // 主界面首页/工作台
    await navigateAndScreenshot(window, '', '02-工作台.png');

    // 技能管理页面
    await navigateAndScreenshot(window, '/skills', '03-技能管理.png');

    // Agent管理页面
    await navigateAndScreenshot(window, '/agents', '04-Agent管理.png');

    // 对话聊天页面
    await navigateAndScreenshot(window, '/sessions', '05-对话聊天.png');

    // 设置页面
    await navigateAndScreenshot(window, '/settings', '06-设置.png');

    console.log('所有截图已保存');
  } catch (error) {
    console.error('截图过程中出错：', error);
  }

  window.close();
  app.quit();
});

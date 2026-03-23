const { app, BrowserWindow } = require('electron');
const { setTimeout } = require('timers');

app.whenReady().then(async () => {
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

    // 模拟点击按钮
    await mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('[aria-label="截取所有页面截图"]').forEach(btn => btn.click());
      console.log('Button clicked');
    `);

    // 等待截图完成
    setTimeout(() => {
      console.log('Screenshots should be taken');
      app.quit();
    }, 10000);

  } catch (error) {
    console.error('Error triggering screenshot:', error);
    app.quit();
  }
});

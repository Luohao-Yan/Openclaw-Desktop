export async function takeScreenshot(filename: string): Promise<{ success: boolean; path?: string; error?: string }> {
  return await window.electronAPI.screenshotTake(filename);
}

export async function navigateAndScreenshot(route: string, filename: string): Promise<{ success: boolean; path?: string; error?: string }> {
  return await window.electronAPI.screenshotNavigateAndTake(route, filename);
}

export async function takeAllScreenshots(): Promise<void> {
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
    try {
      const result = await navigateAndScreenshot(page.route, page.filename);
      if (result.success) {
        console.log(`Screenshot saved to ${result.path}`);
      } else {
        console.error(`Failed to take screenshot of ${page.route}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Failed to take screenshot of ${page.route}:`, error);
    }
  }

  console.log('所有截图已保存');
}

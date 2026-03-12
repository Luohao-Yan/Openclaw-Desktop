const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..');
const electronEntry = path.join(projectRoot, 'dist-electron', 'electron', 'main.js');
const electronWatchDir = path.join(projectRoot, 'dist-electron', 'electron');
const electronSourceDir = path.join(projectRoot, 'electron');
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';
const electronBinary = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', '.bin', 'electron.cmd')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron');

let electronProcess = null;
let restartTimer = null;
let shuttingDown = false;
let watchers = [];

const log = (message) => {
  process.stdout.write(`[dev-electron] ${message}\n`);
};

const waitForFile = (filePath, timeoutMs = 60000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();

  const check = () => {
    if (fs.existsSync(filePath)) {
      resolve();
      return;
    }

    if (Date.now() - startedAt > timeoutMs) {
      reject(new Error(`Timed out waiting for file: ${filePath}`));
      return;
    }

    setTimeout(check, 300);
  };

  check();
});

const waitForDevServer = (url, timeoutMs = 60000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();

  const check = () => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve();
    });

    request.on('error', () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for dev server: ${url}`));
        return;
      }

      setTimeout(check, 500);
    });
  };

  check();
});

const killElectron = () => new Promise((resolve) => {
  if (!electronProcess) {
    resolve();
    return;
  }

  const processRef = electronProcess;
  electronProcess = null;

  processRef.once('exit', () => resolve());
  processRef.kill('SIGTERM');

  setTimeout(() => {
    try {
      processRef.kill('SIGKILL');
    } catch (error) {
      resolve();
    }
  }, 2500);
});

const startElectron = async () => {
  await killElectron();

  log('starting Electron');
  electronProcess = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });

  electronProcess.on('exit', (code, signal) => {
    if (electronProcess && electronProcess.exitCode === code) {
      electronProcess = null;
    }

    if (!shuttingDown) {
      log(`Electron exited (code=${code}, signal=${signal || 'none'})`);
    }
  });
};

const scheduleRestart = () => {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startElectron().catch((error) => {
      log(`failed to restart Electron: ${error.message}`);
    });
  }, 250);
};

const watchElectronOutput = () => {
  if (!fs.existsSync(electronWatchDir)) {
    log(`watch directory not found yet: ${electronWatchDir}`);
    return;
  }

  const watcher = fs.watch(electronWatchDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) {
      return;
    }

    if (!filename.endsWith('.js')) {
      return;
    }

    log(`detected Electron build change: ${filename}`);
    scheduleRestart();
  });

  watchers.push(watcher);
};

const watchElectronSource = () => {
  if (!fs.existsSync(electronSourceDir)) {
    log(`source watch directory not found yet: ${electronSourceDir}`);
    return;
  }

  const watcher = fs.watch(electronSourceDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) {
      return;
    }

    if (!filename.endsWith('.cjs') && !filename.endsWith('.js')) {
      return;
    }

    log(`detected Electron source change: ${filename}`);
    scheduleRestart();
  });

  watchers.push(watcher);
};

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  watchers.forEach((watcher) => watcher.close());
  watchers = [];

  await killElectron();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  watchers.forEach((watcher) => watcher.close());
});

(async () => {
  log('waiting for Vite dev server');
  await waitForDevServer(devServerUrl);

  log('waiting for Electron build output');
  await waitForFile(electronEntry);

  watchElectronOutput();
  watchElectronSource();
  await startElectron();
})().catch((error) => {
  log(error.message);
  process.exit(1);
});

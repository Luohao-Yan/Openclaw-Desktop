import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';

export type TailscaleExposureMode = 'off' | 'tailnet' | 'public';

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  dnsName?: string;
  tailnet?: string;
  exposureMode: TailscaleExposureMode;
  statusText: string;
  error?: string;
}

interface TailscaleStatusJson {
  BackendState?: string;
  Self?: {
    DNSName?: string;
  };
  CurrentTailnet?: {
    Name?: string;
  };
}

const runCommand = async (
  cmd: string,
  args: string[],
  timeoutMs = 10000,
): Promise<{ success: boolean; output: string; error?: string }> => {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: { success: boolean; output: string; error?: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    try {
      const child = spawn(cmd, args);
      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output });
          return;
        }

        finish({
          success: false,
          output,
          error: errorOutput.trim() || `Command exited with code ${code}`,
        });
      });

      child.on('error', (error) => {
        finish({ success: false, output: '', error: error.message });
      });

      setTimeout(() => {
        try {
          child.kill();
        } catch {
        }

        finish({ success: false, output: '', error: 'Command timeout' });
      }, timeoutMs);
    } catch (error) {
      finish({
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};

const resolveVersion = async (): Promise<string | undefined> => {
  const versionResult = await runCommand('tailscale', ['version']);
  if (!versionResult.success) {
    return undefined;
  }

  const line = versionResult.output
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);

  return line || undefined;
};

const resolveExposureMode = async (): Promise<TailscaleExposureMode> => {
  const funnelResult = await runCommand('tailscale', ['funnel', 'status']);
  if (funnelResult.success && funnelResult.output.trim()) {
    return 'public';
  }

  const serveResult = await runCommand('tailscale', ['serve', 'status']);
  if (serveResult.success && serveResult.output.trim()) {
    return 'tailnet';
  }

  return 'off';
};

export const tailscaleStatus = async (): Promise<TailscaleStatus> => {
  const version = await resolveVersion();
  if (!version) {
    return {
      installed: false,
      running: false,
      exposureMode: 'off',
      statusText: 'Tailscale is not installed',
      error: 'tailscale CLI not found',
    };
  }

  const result = await runCommand('tailscale', ['status', '--json']);
  if (!result.success) {
    return {
      installed: true,
      running: false,
      version,
      exposureMode: 'off',
      statusText: 'Tailscale is installed but not running',
      error: result.error,
    };
  }

  try {
    const parsed = JSON.parse(result.output) as TailscaleStatusJson;
    const backendState = parsed.BackendState || 'Stopped';
    const running = !['NoState', 'Stopped'].includes(backendState);
    const exposureMode = await resolveExposureMode();

    return {
      installed: true,
      running,
      version,
      dnsName: parsed.Self?.DNSName,
      tailnet: parsed.CurrentTailnet?.Name,
      exposureMode,
      statusText: running
        ? 'Tailscale is running'
        : 'Tailscale is installed but not running',
    };
  } catch (error) {
    return {
      installed: true,
      running: false,
      version,
      exposureMode: 'off',
      statusText: 'Failed to parse Tailscale status',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const tailscaleStart = async (): Promise<{ success: boolean; error?: string }> => {
  const openResult = await runCommand('open', ['-a', 'Tailscale'], 5000);
  if (!openResult.success) {
    return {
      success: false,
      error: openResult.error || 'Failed to launch Tailscale',
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const status = await tailscaleStatus();
  return {
    success: status.installed,
    error: status.running ? undefined : status.error,
  };
};

export const tailscaleApplyExposure = async (
  _: unknown,
  mode: TailscaleExposureMode,
  port: number,
): Promise<{ success: boolean; error?: string }> => {
  const target = String(port || 18789);

  const resetServe = await runCommand('tailscale', ['serve', 'off']);
  const resetFunnel = await runCommand('tailscale', ['funnel', 'off']);

  if (mode === 'off') {
    return {
      success: resetServe.success || resetFunnel.success,
      error: resetServe.error || resetFunnel.error,
    };
  }

  if (mode === 'tailnet') {
    const serveResult = await runCommand('tailscale', ['serve', target]);
    return {
      success: serveResult.success,
      error: serveResult.error,
    };
  }

  const funnelResult = await runCommand('tailscale', ['funnel', target]);
  return {
    success: funnelResult.success,
    error: funnelResult.error,
  };
};

export function setupTailscaleIPC() {
  ipcMain.handle('tailscale:status', tailscaleStatus);
  ipcMain.handle('tailscale:start', tailscaleStart);
  ipcMain.handle('tailscale:applyExposure', tailscaleApplyExposure);
}

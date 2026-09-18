import { exec } from 'child_process';
import path from 'path';

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
}

export interface RunnerOptions {
  mode?: 'auto' | 'docker' | 'local';
  sandboxContainerName?: string;
  timeoutMs?: number;
}

/**
 * Strips ANSI terminal escape sequences to ensure clean strings for LLM consumption.
 */
export function stripAnsi(text: string): string {
  return text.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
}

export class SandboxRunner {
  private mode: 'auto' | 'docker' | 'local';
  private sandboxContainerName: string;
  private timeoutMs: number;
  private dockerVerified: boolean | null = null;

  constructor(options: RunnerOptions = {}) {
    this.mode = options.mode || (process.env.EXECUTION_MODE as any) || 'auto';
    this.sandboxContainerName =
      options.sandboxContainerName ||
      process.env.SANDBOX_CONTAINER_NAME ||
      'hefaetus-sandbox';
    this.timeoutMs = options.timeoutMs || 120000;
  }

  /**
   * Checks if Docker daemon is accessible and the sandbox container is currently running.
   */
  public async isDockerSandboxActive(): Promise<boolean> {
    if (this.dockerVerified !== null) {
      return this.dockerVerified;
    }

    try {
      const checkCmd = `docker ps --filter "name=${this.sandboxContainerName}" --format "{{.Names}}"`;
      const res = await this.executeRaw(checkCmd, process.cwd(), 5000);
      const isRunning =
        res.exitCode === 0 && res.stdout.includes(this.sandboxContainerName);
      this.dockerVerified = isRunning;
      return isRunning;
    } catch {
      this.dockerVerified = false;
      return false;
    }
  }

  /**
   * Executes a command using child_process.exec, resolving into an ExecutionResult.
   */
  private executeRaw(
    cmd: string,
    cwd: string,
    timeoutMs: number = this.timeoutMs
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(
        cmd,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10 MB buffer
          env: {
            ...process.env,
            FORCE_COLOR: '0',
            CI: 'true',
          },
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const cleanStdout = stripAnsi(stdout || '');
          const cleanStderr = stripAnsi(stderr || '');

          if (error) {
            resolve({
              success: false,
              exitCode: error.code ?? 1,
              stdout: cleanStdout,
              stderr: cleanStderr || error.message,
              durationMs,
              command: cmd,
            });
          } else {
            resolve({
              success: true,
              exitCode: 0,
              stdout: cleanStdout,
              stderr: cleanStderr,
              durationMs,
              command: cmd,
            });
          }
        }
      );
    });
  }

  /**
   * Runs an arbitrary command either inside the Docker sandbox container or in the local target directory.
   */
  public async runInTarget(
    command: string,
    targetDir: string
  ): Promise<ExecutionResult> {
    const useDocker =
      this.mode === 'docker' ||
      (this.mode === 'auto' && (await this.isDockerSandboxActive()));

    if (useDocker) {
      // In Docker Compose, the mock-target-app is mounted inside the sandbox container at /workspace
      // or at the container workdir.
      const dockerExecCmd = `docker exec -w /workspace ${this.sandboxContainerName} ${command}`;
      return await this.executeRaw(dockerExecCmd, process.cwd());
    } else {
      const resolvedDir = path.resolve(targetDir);
      return await this.executeRaw(command, resolvedDir);
    }
  }

  /**
   * Executes `npm install` inside the target workspace (sandbox or local).
   */
  public async runNpmInstall(targetDir: string): Promise<ExecutionResult> {
    return this.runInTarget('npm install', targetDir);
  }

  /**
   * Executes `npm test` inside the target workspace (sandbox or local).
   */
  public async runNpmTest(targetDir: string): Promise<ExecutionResult> {
    return this.runInTarget('npm test', targetDir);
  }

  /**
   * Determines active runner mode descriptor for logging.
   */
  public async getActiveModeDescription(): Promise<string> {
    const active = await this.isDockerSandboxActive();
    if (this.mode === 'docker') {
      return active
        ? `Docker Sandbox (${this.sandboxContainerName}) [Enforced]`
        : `Docker Sandbox (${this.sandboxContainerName}) [Offline / Connection Warning]`;
    }
    if (this.mode === 'local') {
      return `Local Execution Engine [Enforced]`;
    }
    return active
      ? `Docker Sandbox (${this.sandboxContainerName}) [Auto-detected]`
      : `Local Execution Engine (Docker sandbox not detected, fallback enabled)`;
  }
}

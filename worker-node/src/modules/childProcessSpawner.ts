import { spawn, SpawnOptions } from 'child_process';
import logger from './logger';
import { ChildProcessResult } from '../types';

/**
 * Spawn a child process and capture output
 * @param command - Command to execute
 * @param args - Array of command arguments
 * @param options - Spawn options including environment variables
 * @returns Promise with process result
 */
export function spawnChildProcess(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<ChildProcessResult> {
  return new Promise((resolve) => {
    logger.info(`Spawning child process: ${command} ${args.join(' ')}`);

    let stdout = '';
    let stderr = '';

    const child = spawn(command, args, {
      ...options,
      stdio: ['inherit', 'pipe', 'pipe'], // stdin: inherit, stdout/stderr: pipe
    });

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      logger.info(`[CHILD STDOUT] ${output.trim()}`);
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      logger.warn(`[CHILD STDERR] ${output.trim()}`);
    });

    // Handle process completion
    child.on('close', (code: number | null) => {
      const exitCode = code ?? -1;

      if (exitCode === 0) {
        logger.info(`Child process completed successfully with exit code: ${exitCode}`);
        resolve({
          success: true,
          exitCode,
          stdout,
          stderr,
        });
      } else {
        logger.error(`Child process failed with exit code: ${exitCode}`);
        resolve({
          success: false,
          exitCode,
          stdout,
          stderr,
          error: new Error(`Process exited with code ${exitCode}`),
        });
      }
    });

    // Handle process errors
    child.on('error', (error: Error) => {
      logger.error(`Child process error: ${error.message}`);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        error,
      });
    });
  });
}

/**
 * Build environment variables for child process
 * @param childAppName - Name of the child process app
 * @param additionalEnv - Additional environment variables
 * @returns Environment variables object
 */
export function buildChildProcessEnv(
  childAppName: string,
  additionalEnv?: Record<string, string>
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NAME_APP: childAppName,
    ...additionalEnv,
  };
}

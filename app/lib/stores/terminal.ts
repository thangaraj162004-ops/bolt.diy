import { atom, type WritableAtom } from 'nanostores';
import type { WebContainer, WebContainerProcess } from '~/lib/webcontainer/types';
import type { ITerminal } from '~/types/terminal';
import { newCaShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #caTerminal = newCaShellProcess();
  #pendingCaOutput = '';
  #caOutputReady = false;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  get caTerminal() {
    return this.#caTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  writeToCaTerminal(data: string) {
    const terminal = this.#caTerminal.terminal;

    if (terminal && this.#caOutputReady) {
      terminal.write(data);
    } else {
      // Tools can start before the workbench mounts its terminal.
      this.#pendingCaOutput = (this.#pendingCaOutput + data).slice(-64_000);
    }
  }

  async attachCaTerminal(terminal: ITerminal) {
    this.#caOutputReady = false;

    try {
      const wc = await this.#webcontainer;
      await this.#caTerminal.init(wc, terminal);

      if (this.#pendingCaOutput) {
        terminal.write(this.#pendingCaOutput);
        this.#pendingCaOutput = '';
      }

      this.#caOutputReady = true;
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);
      return;
    }
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }
}

import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, type PanelImperativeHandle } from 'react-resizable-panels';
import { Terminal, type TerminalRef } from './Terminal';
import { TerminalManager } from './TerminalManager';
import { IconButton } from '~/components/ui/IconButton';
import { PRODUCT_NAME } from '~/lib/brand';
import { isPhoneWidth } from '~/lib/stores/layout';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 3;
export const DEFAULT_TERMINAL_SIZE = 25;

/** Height of the collapsed terminal bar: 44 px on a phone (a full touch target), 34 px elsewhere. */
function minimizedTerminalHeight() {
  return isPhoneWidth() ? 44 : 34;
}

export const TerminalTabs = memo(() => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(0);
  const [isMinimized, setIsMinimized] = useState(!showTerminal);

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(terminalCount + 1);
      setActiveTerminal(terminalCount);
    }
  };

  const closeTerminal = useCallback(
    (index: number) => {
      if (index === 0) {
        return;
      } // Can't close ca terminal

      const terminalRef = terminalRefs.current.get(index);

      if (terminalRef?.getTerminal) {
        const terminal = terminalRef.getTerminal();

        if (terminal) {
          workbenchStore.detachTerminal(terminal);
        }
      }

      // Remove the terminal from refs
      terminalRefs.current.delete(index);

      // Adjust terminal count and active terminal
      setTerminalCount(terminalCount - 1);

      if (activeTerminal === index) {
        setActiveTerminal(Math.max(0, index - 1));
      } else if (activeTerminal > index) {
        setActiveTerminal(activeTerminal - 1);
      }
    },
    [activeTerminal, terminalCount],
  );

  useEffect(() => {
    return () => {
      terminalRefs.current.forEach((ref, index) => {
        if (index > 0 && ref?.getTerminal) {
          const terminal = ref.getTerminal();

          if (terminal) {
            workbenchStore.detachTerminal(terminal);
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const terminalSize = terminal.getSize().inPixels;

    if (!showTerminal && terminalSize > minimizedTerminalHeight()) {
      terminal.resize(`${minimizedTerminalHeight()}px`);
    } else if (showTerminal && terminalSize <= minimizedTerminalHeight()) {
      terminal.resize(`${DEFAULT_TERMINAL_SIZE}%`);
    }
  }, [showTerminal]);

  useEffect(() => {
    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      terminalRefs.current.forEach((ref) => {
        ref?.reloadStyles();
      });
    });

    return () => {
      unsubscribeFromThemeStore();
    };
  }, []);

  return (
    <Panel
      panelRef={terminalPanelRef}
      defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : `${minimizedTerminalHeight()}px`}
      minSize={`${minimizedTerminalHeight()}px`}
      onResize={(size) => {
        /*
         * A phone layout change (for example the workbench toolbar hiding for the
         * preview) stretches the collapsed bar by a few pixels; that is not the user
         * opening the terminal, so phones allow some slack.
         */
        const minimized = size.inPixels <= minimizedTerminalHeight() + (isPhoneWidth() ? 8 : 1);
        setIsMinimized(minimized);

        if (workbenchStore.showTerminal.get() !== !minimized) {
          workbenchStore.toggleTerminal(!minimized);
        }
      }}
    >
      {isMinimized && (
        <div className="h-full min-h-[34px] touch:min-h-11 flex items-center justify-end bg-ca-elements-background-depth-2 border-t border-ca-elements-borderColor px-2">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1 touch:min-h-11 rounded-md bg-transparent text-sm text-ca-elements-textPrimary hover:bg-ca-elements-terminals-buttonBackground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-elements-focus"
            title="Expand terminal"
            onClick={() => {
              terminalPanelRef.current?.resize(`${DEFAULT_TERMINAL_SIZE}%`);
              workbenchStore.toggleTerminal(true);
            }}
          >
            <div className="i-ph:terminal-window-duotone text-lg" />
            <span>Terminal</span>
            <div className="i-ph:caret-up text-sm" />
          </button>
        </div>
      )}
      <div className={classNames('h-full', { hidden: isMinimized })}>
        <div className="bg-ca-elements-terminals-background h-full flex flex-col">
          <div className="flex items-center bg-ca-elements-background-depth-2 border-y border-ca-elements-borderColor gap-1.5 min-h-[34px] p-2">
            {Array.from({ length: terminalCount + 1 }, (_, index) => {
              const isActive = activeTerminal === index;

              return (
                <React.Fragment key={index}>
                  {index == 0 ? (
                    <button
                      key={index}
                      className={classNames(
                        'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                        {
                          'bg-ca-elements-terminals-buttonBackground text-ca-elements-textSecondary hover:text-ca-elements-textPrimary':
                            isActive,
                          'bg-ca-elements-background-depth-2 text-ca-elements-textSecondary hover:bg-ca-elements-terminals-buttonBackground':
                            !isActive,
                        },
                      )}
                      onClick={() => setActiveTerminal(index)}
                    >
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      {PRODUCT_NAME} Terminal
                    </button>
                  ) : (
                    <React.Fragment>
                      <button
                        key={index}
                        className={classNames(
                          'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                          {
                            'bg-ca-elements-terminals-buttonBackground text-ca-elements-textPrimary': isActive,
                            'bg-ca-elements-background-depth-2 text-ca-elements-textSecondary hover:bg-ca-elements-terminals-buttonBackground':
                              !isActive,
                          },
                        )}
                        onClick={() => setActiveTerminal(index)}
                      >
                        <div className="i-ph:terminal-window-duotone text-lg" />
                        Terminal {terminalCount > 1 && index}
                        <button
                          className="bg-transparent text-ca-elements-textTertiary hover:text-ca-elements-textPrimary hover:bg-transparent rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTerminal(index);
                          }}
                        >
                          <div className="i-ph:x text-xs" />
                        </button>
                      </button>
                    </React.Fragment>
                  )}
                </React.Fragment>
              );
            })}
            {terminalCount < MAX_TERMINALS && <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />}
            <IconButton
              icon="i-ph:arrow-clockwise"
              title="Reset Terminal"
              size="md"
              onClick={() => {
                const ref = terminalRefs.current.get(activeTerminal);

                if (ref?.getTerminal()) {
                  const terminal = ref.getTerminal()!;
                  terminal.clear();
                  terminal.focus();

                  if (activeTerminal === 0) {
                    workbenchStore.attachCaTerminal(terminal);
                  } else {
                    workbenchStore.attachTerminal(terminal);
                  }
                }
              }}
            />
            <IconButton
              className="ml-auto touch:min-w-11 touch:min-h-11"
              icon="i-ph:minus"
              title="Minimize terminal"
              size="md"
              onClick={() => {
                terminalPanelRef.current?.resize(`${minimizedTerminalHeight()}px`);
                workbenchStore.toggleTerminal(false);
              }}
            />
          </div>
          {Array.from({ length: terminalCount + 1 }, (_, index) => {
            const isActive = activeTerminal === index;

            logger.debug(`Starting ca terminal [${index}]`);

            if (index == 0) {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
                  <Terminal
                    key={`terminal-${index}`}
                    id={`terminal_${index}`}
                    className={classNames('h-full overflow-hidden modern-scrollbar-invert', {
                      hidden: !isActive,
                    })}
                    ref={(ref) => {
                      if (ref) {
                        terminalRefs.current.set(index, ref);
                      }
                    }}
                    onTerminalReady={(terminal) => workbenchStore.attachCaTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                  />
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            } else {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
                  <Terminal
                    key={`terminal-${index}`}
                    id={`terminal_${index}`}
                    className={classNames('modern-scrollbar h-full overflow-hidden', {
                      hidden: !isActive,
                    })}
                    ref={(ref) => {
                      if (ref) {
                        terminalRefs.current.set(index, ref);
                      }
                    }}
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                  />
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            }
          })}
        </div>
      </div>
    </Panel>
  );
});

import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--ca-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--ca-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--ca-elements-terminal-textColor'),
    background: cssVar('--ca-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--ca-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--ca-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--ca-elements-terminal-selection-backgroundColorInactive'),
    scrollbarSliderBackground: cssVar('--modern-scrollbar-thumb-background'),
    scrollbarSliderHoverBackground: cssVar('--modern-scrollbar-thumb-backgroundHover'),
    scrollbarSliderActiveBackground: cssVar('--modern-scrollbar-thumb-backgroundHover'),

    // ansi escape code colors
    black: cssVar('--ca-elements-terminal-color-black'),
    red: cssVar('--ca-elements-terminal-color-red'),
    green: cssVar('--ca-elements-terminal-color-green'),
    yellow: cssVar('--ca-elements-terminal-color-yellow'),
    blue: cssVar('--ca-elements-terminal-color-blue'),
    magenta: cssVar('--ca-elements-terminal-color-magenta'),
    cyan: cssVar('--ca-elements-terminal-color-cyan'),
    white: cssVar('--ca-elements-terminal-color-white'),
    brightBlack: cssVar('--ca-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--ca-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--ca-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--ca-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--ca-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--ca-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--ca-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--ca-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}

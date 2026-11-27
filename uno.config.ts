import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { globSync } from 'fast-glob';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';
import { MOUSE_LAYOUT_QUERY, TOUCH_LAYOUT_QUERY, TOUCH_WIDE_QUERY } from './app/lib/touchLayout';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'ca';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  accent: {
    50: '#F8F5FF',
    100: '#F0EBFF',
    200: '#E1D6FF',
    300: '#CEBEFF',
    400: '#B69EFF',
    500: '#9C7DFF',
    600: '#8A5FFF',
    700: '#7645E8',
    800: '#6234BB',
    900: '#502D93',
    950: '#2D1959',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  /*
   * `touch:` = the phone layout (below 768 px); `mouse:` = the desktop layout
   * (768 px and wider, any pointer); `touch-wide:` = the desktop layout used
   * with a finger. See app/lib/touchLayout.ts. (Two media variants do not
   * stack, so `touch:md:` would lose its width: use `touch-wide:`.)
   */
  variants: [
    (matcher) =>
      matcher.startsWith('touch-wide:')
        ? { matcher: matcher.slice(11), parent: `@media ${TOUCH_WIDE_QUERY}` }
        : undefined,
    (matcher) =>
      matcher.startsWith('touch:') ? { matcher: matcher.slice(6), parent: `@media ${TOUCH_LAYOUT_QUERY}` } : undefined,
    (matcher) =>
      matcher.startsWith('mouse:') ? { matcher: matcher.slice(6), parent: `@media ${MOUSE_LAYOUT_QUERY}` } : undefined,
  ],
  safelist: [...Object.keys(customIconCollection[collectionName] || {}).map((x) => `i-ca:${x}`)],
  shortcuts: {
    'ca-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 ca-ease-cubic-bezier',
    kdb: 'bg-ca-elements-code-background text-ca-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      ca: {
        elements: {
          borderColor: 'var(--ca-elements-borderColor)',
          borderColorActive: 'var(--ca-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--ca-elements-bg-depth-1)',
              2: 'var(--ca-elements-bg-depth-2)',
              3: 'var(--ca-elements-bg-depth-3)',
              4: 'var(--ca-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--ca-elements-textPrimary)',
          textSecondary: 'var(--ca-elements-textSecondary)',
          textTertiary: 'var(--ca-elements-textTertiary)',
          code: {
            background: 'var(--ca-elements-code-background)',
            text: 'var(--ca-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--ca-elements-button-primary-background)',
              backgroundHover: 'var(--ca-elements-button-primary-backgroundHover)',
              text: 'var(--ca-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--ca-elements-button-secondary-background)',
              backgroundHover: 'var(--ca-elements-button-secondary-backgroundHover)',
              text: 'var(--ca-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--ca-elements-button-danger-background)',
              backgroundHover: 'var(--ca-elements-button-danger-backgroundHover)',
              text: 'var(--ca-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--ca-elements-item-contentDefault)',
            contentActive: 'var(--ca-elements-item-contentActive)',
            contentAccent: 'var(--ca-elements-item-contentAccent)',
            contentDanger: 'var(--ca-elements-item-contentDanger)',
            backgroundDefault: 'var(--ca-elements-item-backgroundDefault)',
            backgroundActive: 'var(--ca-elements-item-backgroundActive)',
            backgroundAccent: 'var(--ca-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--ca-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--ca-elements-actions-background)',
            code: {
              background: 'var(--ca-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--ca-elements-artifacts-background)',
            backgroundHover: 'var(--ca-elements-artifacts-backgroundHover)',
            borderColor: 'var(--ca-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--ca-elements-artifacts-inlineCode-background)',
              text: 'var(--ca-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--ca-elements-messages-background)',
            linkColor: 'var(--ca-elements-messages-linkColor)',
            code: {
              background: 'var(--ca-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--ca-elements-messages-inlineCode-background)',
              text: 'var(--ca-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--ca-elements-icon-success)',
            error: 'var(--ca-elements-icon-error)',
            primary: 'var(--ca-elements-icon-primary)',
            secondary: 'var(--ca-elements-icon-secondary)',
            tertiary: 'var(--ca-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--ca-elements-preview-addressBar-background)',
              backgroundHover: 'var(--ca-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--ca-elements-preview-addressBar-backgroundActive)',
              text: 'var(--ca-elements-preview-addressBar-text)',
              textActive: 'var(--ca-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--ca-elements-terminals-background)',
            buttonBackground: 'var(--ca-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--ca-elements-dividerColor)',
          loader: {
            background: 'var(--ca-elements-loader-background)',
            progress: 'var(--ca-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--ca-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--ca-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--ca-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--ca-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--ca-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--ca-elements-cta-background)',
            text: 'var(--ca-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
      unit: 'em',
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}

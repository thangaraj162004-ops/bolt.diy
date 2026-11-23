# Rename map: Bolt -> Ca

Every name that contained `bolt`, `Bolt`, `BOLT`, `stackblitz` or `StackBlitz` before the rename,
grouped by kind, with the new name and the number of occurrences found across the repository
(counted before the rename, in the files the rename covered).

Prefix check: before renaming, every new name (`ca`/`Ca`/`CA` + the rest) was searched for in the code;
none existed, so the short prefix is used (not `codeapp`).

No file or folder in the app had `bolt` in its name, so no `git mv` was needed. The only such file is
`docs/images/bolt-settings-button.png` in the upstream documentation, which is kept.

## Summary

| Group | Distinct names | Occurrences |
|---|---:|---:|
| Artifact tags and prompt markers | 27 | 514 |
| CSS classes and variables | 335 | 3936 |
| Data attributes | 5 | 18 |
| Icons (UnoCSS collection) | 18 | 19 |
| Storage, IndexedDB and event keys | 28 | 77 |
| Docker, desktop and deploy names | 15 | 28 |
| Globals and constants (UPPER_CASE) | 12 | 23 |
| Classes, types and functions | 51 | 180 |
| Standalone word bolt (CSS class, comments, collection name) | 2 | 53 |
| Product name in comments and strings | 7 | 97 |
| **Kept (not renamed)** | 142 | 223 |

## Artifact tags and prompt markers

| Old | New | Occurrences |
|---|---|---:|
| `boltAction` | `caAction` | 152 |
| `/boltAction` | `/caAction` | 126 |
| `boltArtifact` | `caArtifact` | 79 |
| `/boltArtifact` | `/caArtifact` | 60 |
| `__boltArtifact__` | `__caArtifact__` | 16 |
| `bolt-quick-action` | `ca-quick-action` | 14 |
| `/bolt-quick-action` | `/ca-quick-action` | 14 |
| `__boltThought__` | `__caThought__` | 13 |
| `boltArti` | `caArti` | 5 |
| `__boltQuickAction__` | `__caQuickAction__` | 5 |
| `bolt-quick-actions` | `ca-quick-actions` | 3 |
| `__boltSelectedElement__` | `__caSelectedElement__` | 3 |
| `data-bolt-quick-action` | `data-ca-quick-action` | 2 |
| `bolta` | `caa` | 2 |
| `bolt_file_modifications` | `ca_file_modifications` | 2 |
| `boltArtifactt` | `caArtifactt` | 2 |
| `boltArtifact/boltAction` | `caArtifact/caAction` | 2 |
| `boltArtifacs` | `caArtifacs` | 2 |
| `__boltQuickAction` | `__caQuickAction` | 2 |
| `/bolt-quick-actions` | `/ca-quick-actions` | 2 |
| `.dataBoltQuickAction` | `.dataCaQuickAction` | 2 |
| `bolt_running_commands` | `ca_running_commands` | 1 |
| `bolt_quick_actions` | `ca_quick_actions` | 1 |
| `boltA` | `caA` | 1 |
| `/bolt_running_commands` | `/ca_running_commands` | 1 |
| `/bolt_quick_actions` | `/ca_quick_actions` | 1 |
| `/bolt_file_modifications` | `/ca_file_modifications` | 1 |

## CSS classes and variables

Utility prefixes such as `text-`, `bg-`, `hover:` and `dark:` are folded into one row.

| Old | New | Occurrences |
|---|---|---:|
| `bolt-elements-textPrimary` | `ca-elements-textPrimary` | 682 |
| `bolt-elements-textSecondary` | `ca-elements-textSecondary` | 605 |
| `bolt-elements-borderColor` | `ca-elements-borderColor` | 444 |
| `bolt-elements-background-depth-2` | `ca-elements-background-depth-2` | 263 |
| `bolt-elements-item-contentAccent` | `ca-elements-item-contentAccent` | 206 |
| `bolt-elements-background-depth-3` | `ca-elements-background-depth-3` | 190 |
| `bolt-elements-textTertiary` | `ca-elements-textTertiary` | 181 |
| `bolt-elements-background-depth-1` | `ca-elements-background-depth-1` | 170 |
| `bolt-elements-borderColorActive` | `ca-elements-borderColorActive` | 116 |
| `bolt-elements-borderColor-dark` | `ca-elements-borderColor-dark` | 57 |
| `bolt-elements-background-depth-4` | `ca-elements-background-depth-4` | 53 |
| `bolt-elements-item-backgroundActive` | `ca-elements-item-backgroundActive` | 51 |
| `bolt-elements-textSecondary-dark` | `ca-elements-textSecondary-dark` | 46 |
| `bolt-elements-textPrimary-dark` | `ca-elements-textPrimary-dark` | 46 |
| `bolt-elements-item-backgroundAccent` | `ca-elements-item-backgroundAccent` | 46 |
| `bolt-elements-background` | `ca-elements-background` | 44 |
| `bolt-elements-icon-success` | `ca-elements-icon-success` | 27 |
| `bolt-elements-textTertiary-dark` | `ca-elements-textTertiary-dark` | 25 |
| `bolt-elements-bg-depth-2` | `ca-elements-bg-depth-2` | 24 |
| `bolt-elements-loader-progress` | `ca-elements-loader-progress` | 19 |
| `bolt-elements-bg-depth-1` | `ca-elements-bg-depth-1` | 18 |
| `bolt-elements-button-primary-backgroundHover` | `ca-elements-button-primary-backgroundHover` | 17 |
| `bolt-elements-item-contentDefault` | `ca-elements-item-contentDefault` | 16 |
| `bolt-elements-bg-depth-3` | `ca-elements-bg-depth-3` | 16 |
| `bolt-elements-button-primary-text` | `ca-elements-button-primary-text` | 16 |
| `bolt-elements-focus` | `ca-elements-focus` | 15 |
| `bolt-elements-icon-error` | `ca-elements-icon-error` | 14 |
| `bolt-elements-button-primary-background` | `ca-elements-button-primary-background` | 14 |
| `bolt-elements-item-contentActive` | `ca-elements-item-contentActive` | 14 |
| `bolt-elements-button-secondary-background` | `ca-elements-button-secondary-background` | 13 |
| `bolt-elements-terminals-background` | `ca-elements-terminals-background` | 12 |
| `bolt-elements-artifacts-background` | `ca-elements-artifacts-background` | 12 |
| `bolt-elements-actions-background` | `ca-elements-actions-background` | 12 |
| `bolt-elements-button-secondary-text` | `ca-elements-button-secondary-text` | 12 |
| `bolt-elements-sidebar-buttonText` | `ca-elements-sidebar-buttonText` | 11 |
| `--bolt-terminal-foreground` | `--ca-terminal-foreground` | 10 |
| `bolt-elements-messages-linkColor` | `ca-elements-messages-linkColor` | 10 |
| `bolt-elements-code-background` | `ca-elements-code-background` | 10 |
| `bolt-elements-button-secondary-backgroundHover` | `ca-elements-button-secondary-backgroundHover` | 10 |
| `--bolt-terminal-background` | `--ca-terminal-background` | 9 |
| `bolt-elements-messages-background` | `ca-elements-messages-background` | 9 |
| `bolt-elements-item-backgroundDefault` | `ca-elements-item-backgroundDefault` | 9 |
| `bolt-elements-code-text` | `ca-elements-code-text` | 8 |
| `bolt-elements-artifacts-backgroundHover` | `ca-elements-artifacts-backgroundHover` | 8 |
| `bolt-elements-link-textHover` | `ca-elements-link-textHover` | 8 |
| `bolt-elements-artifacts-borderColor` | `ca-elements-artifacts-borderColor` | 8 |
| `bolt-elements-terminals-buttonBackground` | `ca-elements-terminals-buttonBackground` | 8 |
| `bolt-elements-button-danger-background` | `ca-elements-button-danger-background` | 8 |
| `bolt-elements-icon-info` | `ca-elements-icon-info` | 7 |
| `bolt-elements-artifacts-inlineCode-text` | `ca-elements-artifacts-inlineCode-text` | 7 |
| `bolt-elements-artifacts-inlineCode-background` | `ca-elements-artifacts-inlineCode-background` | 7 |
| `bolt-elements-button-danger-text` | `ca-elements-button-danger-text` | 7 |
| `bolt-elements-messages-inlineCode-text` | `ca-elements-messages-inlineCode-text` | 6 |
| `bolt-elements-messages-inlineCode-background` | `ca-elements-messages-inlineCode-background` | 6 |
| `bolt-elements-bg-depth-4` | `ca-elements-bg-depth-4` | 6 |
| `bolt-elements-icon-warning` | `ca-elements-icon-warning` | 5 |
| `bolt-elements-terminal-backgroundColor` | `ca-elements-terminal-backgroundColor` | 5 |
| `bolt-elements-cta-text` | `ca-elements-cta-text` | 5 |
| `bolt-elements-sidebar-buttonBackgroundDefault` | `ca-elements-sidebar-buttonBackgroundDefault` | 5 |
| `bolt-elements-prompt-background` | `ca-elements-prompt-background` | 5 |
| `bolt-elements-preview-addressBar-text` | `ca-elements-preview-addressBar-text` | 5 |
| `bolt-elements-preview-addressBar-backgroundHover` | `ca-elements-preview-addressBar-backgroundHover` | 5 |
| `bolt-elements-preview-addressBar-backgroundActive` | `ca-elements-preview-addressBar-backgroundActive` | 5 |
| `bolt-elements-preview-addressBar-background` | `ca-elements-preview-addressBar-background` | 5 |
| `bolt-elements-link-text` | `ca-elements-link-text` | 4 |
| `bolt-ease-cubic-bezier` | `ca-ease-cubic-bezier` | 4 |
| `bolt-elements-messages-code-background` | `ca-elements-messages-code-background` | 4 |
| `bolt-elements-actions-code-background` | `ca-elements-actions-code-background` | 4 |
| `bolt-elements-ring` | `ca-elements-ring` | 4 |
| `bolt-elements-preview-addressBar-textActive` | `ca-elements-preview-addressBar-textActive` | 4 |
| `bolt-elements-icon-tertiary` | `ca-elements-icon-tertiary` | 4 |
| `bolt-elements-button-danger-backgroundHover` | `ca-elements-button-danger-backgroundHover` | 4 |
| `bolt-elements-textDestructive` | `ca-elements-textDestructive` | 4 |
| `--bolt-terminal-yellow` | `--ca-terminal-yellow` | 3 |
| `--bolt-terminal-white` | `--ca-terminal-white` | 3 |
| `--bolt-terminal-selection-background` | `--ca-terminal-selection-background` | 3 |
| `--bolt-terminal-red` | `--ca-terminal-red` | 3 |
| `--bolt-terminal-magenta` | `--ca-terminal-magenta` | 3 |
| `--bolt-terminal-green` | `--ca-terminal-green` | 3 |
| `--bolt-terminal-cyan` | `--ca-terminal-cyan` | 3 |
| `--bolt-terminal-brightYellow` | `--ca-terminal-brightYellow` | 3 |
| `--bolt-terminal-brightWhite` | `--ca-terminal-brightWhite` | 3 |
| `--bolt-terminal-brightRed` | `--ca-terminal-brightRed` | 3 |
| `--bolt-terminal-brightMagenta` | `--ca-terminal-brightMagenta` | 3 |
| `--bolt-terminal-brightGreen` | `--ca-terminal-brightGreen` | 3 |
| `--bolt-terminal-brightCyan` | `--ca-terminal-brightCyan` | 3 |
| `--bolt-terminal-brightBlue` | `--ca-terminal-brightBlue` | 3 |
| `--bolt-terminal-brightBlack` | `--ca-terminal-brightBlack` | 3 |
| `--bolt-terminal-blue` | `--ca-terminal-blue` | 3 |
| `--bolt-terminal-black` | `--ca-terminal-black` | 3 |
| `bolt-elements-terminal-textColor` | `ca-elements-terminal-textColor` | 3 |
| `bolt-elements-sidebar-dropdownShadow` | `ca-elements-sidebar-dropdownShadow` | 3 |
| `bolt-elements-sidebar-buttonBackgroundHover` | `ca-elements-sidebar-buttonBackgroundHover` | 3 |
| `bolt-elements-loader-background` | `ca-elements-loader-background` | 3 |
| `bolt-elements-item-contentDanger` | `ca-elements-item-contentDanger` | 3 |
| `bolt-elements-item-backgroundDanger` | `ca-elements-item-backgroundDanger` | 3 |
| `bolt-elements-icon-secondary` | `ca-elements-icon-secondary` | 3 |
| `bolt-elements-icon-primary` | `ca-elements-icon-primary` | 3 |
| `bolt-elements-editor-search-button-backgroundColorHover` | `ca-elements-editor-search-button-backgroundColorHover` | 3 |
| `bolt-elements-editor-search-button-backgroundColor` | `ca-elements-editor-search-button-backgroundColor` | 3 |
| `bolt-elements-editor-gutter-textColor` | `ca-elements-editor-gutter-textColor` | 3 |
| `bolt-elements-editor-gutter-activeLineTextColor` | `ca-elements-editor-gutter-activeLineTextColor` | 3 |
| `bolt-elements-editor-foldGutter-textColorHover` | `ca-elements-editor-foldGutter-textColorHover` | 3 |
| `bolt-elements-editor-activeLineBackgroundColor` | `ca-elements-editor-activeLineBackgroundColor` | 3 |
| `bolt-elements-dividerColor` | `ca-elements-dividerColor` | 3 |
| `bolt-elements-cta-background` | `ca-elements-cta-background` | 3 |
| `bolt-elements-link` | `ca-elements-link` | 2 |
| `bolt-elements-borderColorHover` | `ca-elements-borderColorHover` | 2 |
| `bolt-elements-terminal-selection-backgroundColor` | `ca-elements-terminal-selection-backgroundColor` | 2 |
| `bolt-elements-terminal-cursorColor` | `ca-elements-terminal-cursorColor` | 2 |
| `bolt-elements-terminal-color-yellow` | `ca-elements-terminal-color-yellow` | 2 |
| `bolt-elements-terminal-color-white` | `ca-elements-terminal-color-white` | 2 |
| `bolt-elements-terminal-color-red` | `ca-elements-terminal-color-red` | 2 |
| `bolt-elements-terminal-color-magenta` | `ca-elements-terminal-color-magenta` | 2 |
| `bolt-elements-terminal-color-green` | `ca-elements-terminal-color-green` | 2 |
| `bolt-elements-terminal-color-cyan` | `ca-elements-terminal-color-cyan` | 2 |
| `bolt-elements-terminal-color-brightYellow` | `ca-elements-terminal-color-brightYellow` | 2 |
| `bolt-elements-terminal-color-brightWhite` | `ca-elements-terminal-color-brightWhite` | 2 |
| `bolt-elements-terminal-color-brightRed` | `ca-elements-terminal-color-brightRed` | 2 |
| `bolt-elements-terminal-color-brightMagenta` | `ca-elements-terminal-color-brightMagenta` | 2 |
| `bolt-elements-terminal-color-brightGreen` | `ca-elements-terminal-color-brightGreen` | 2 |
| `bolt-elements-terminal-color-brightCyan` | `ca-elements-terminal-color-brightCyan` | 2 |
| `bolt-elements-terminal-color-brightBlue` | `ca-elements-terminal-color-brightBlue` | 2 |
| `bolt-elements-terminal-color-brightBlack` | `ca-elements-terminal-color-brightBlack` | 2 |
| `bolt-elements-terminal-color-blue` | `ca-elements-terminal-color-blue` | 2 |
| `bolt-elements-terminal-color-black` | `ca-elements-terminal-color-black` | 2 |
| `bolt-elements-editor-tooltip-backgroundColorSelected` | `ca-elements-editor-tooltip-backgroundColorSelected` | 2 |
| `bolt-elements-editor-selection-inactiveBackgroundOpacity` | `ca-elements-editor-selection-inactiveBackgroundOpacity` | 2 |
| `bolt-elements-editor-matchingBracketBackgroundColor` | `ca-elements-editor-matchingBracketBackgroundColor` | 2 |
| `bolt-elements-border` | `ca-elements-border` | 2 |
| `bolt-elements-textTer` | `ca-elements-textTer` | 1 |
| `bolt-elements-item-textSecondary` | `ca-elements-item-textSecondary` | 1 |
| `bolt-elements-icon-accent` | `ca-elements-icon-accent` | 1 |
| `bolt-elements-background-dark` | `ca-elements-background-dark` | 1 |
| `bolt-elements-background-depth-3-dark` | `ca-elements-background-depth-3-dark` | 1 |
| `bolt-elements-item-background-depth-2` | `ca-elements-item-background-depth-2` | 1 |
| `bolt-elements-background-depth-2-dark` | `ca-elements-background-depth-2-dark` | 1 |
| `bolt-elements-background-depth-0` | `ca-elements-background-depth-0` | 1 |
| `bolt-elements-terminal-selection-textColor` | `ca-elements-terminal-selection-textColor` | 1 |
| `bolt-elements-terminal-selection-backgroundColorInactive` | `ca-elements-terminal-selection-backgroundColorInactive` | 1 |
| `bolt-elements-terminal-cursorColorAccent` | `ca-elements-terminal-cursorColorAccent` | 1 |
| `bolt-elements-editor-tooltip-textColorSelected` | `ca-elements-editor-tooltip-textColorSelected` | 1 |
| `bolt-elements-editor-tooltip-textColor` | `ca-elements-editor-tooltip-textColor` | 1 |
| `bolt-elements-editor-tooltip-borderColor` | `ca-elements-editor-tooltip-borderColor` | 1 |
| `bolt-elements-editor-tooltip-backgroundColor` | `ca-elements-editor-tooltip-backgroundColor` | 1 |
| `bolt-elements-editor-textColor` | `ca-elements-editor-textColor` | 1 |
| `bolt-elements-editor-selection-inactiveBackgroundColor` | `ca-elements-editor-selection-inactiveBackgroundColor` | 1 |
| `bolt-elements-editor-selection-backgroundOpacity` | `ca-elements-editor-selection-backgroundOpacity` | 1 |
| `bolt-elements-editor-selection-backgroundColor` | `ca-elements-editor-selection-backgroundColor` | 1 |
| `bolt-elements-editor-searchMatch-backgroundColor` | `ca-elements-editor-searchMatch-backgroundColor` | 1 |
| `bolt-elements-editor-search-textColor` | `ca-elements-editor-search-textColor` | 1 |
| `bolt-elements-editor-search-input-textColor` | `ca-elements-editor-search-input-textColor` | 1 |
| `bolt-elements-editor-search-input-borderColorFocused` | `ca-elements-editor-search-input-borderColorFocused` | 1 |
| `bolt-elements-editor-search-input-borderColor` | `ca-elements-editor-search-input-borderColor` | 1 |
| `bolt-elements-editor-search-input-backgroundColor` | `ca-elements-editor-search-input-backgroundColor` | 1 |
| `bolt-elements-editor-search-closeButton-textColorHover` | `ca-elements-editor-search-closeButton-textColorHover` | 1 |
| `bolt-elements-editor-search-closeButton-textColor` | `ca-elements-editor-search-closeButton-textColor` | 1 |
| `bolt-elements-editor-search-closeButton-backgroundColorHover` | `ca-elements-editor-search-closeButton-backgroundColorHover` | 1 |
| `bolt-elements-editor-search-closeButton-backgroundColor` | `ca-elements-editor-search-closeButton-backgroundColor` | 1 |
| `bolt-elements-editor-search-button-textColorHover` | `ca-elements-editor-search-button-textColorHover` | 1 |
| `bolt-elements-editor-search-button-textColor` | `ca-elements-editor-search-button-textColor` | 1 |
| `bolt-elements-editor-search-button-borderColorHover` | `ca-elements-editor-search-button-borderColorHover` | 1 |
| `bolt-elements-editor-search-button-borderColorFocused` | `ca-elements-editor-search-button-borderColorFocused` | 1 |
| `bolt-elements-editor-search-button-borderColor` | `ca-elements-editor-search-button-borderColor` | 1 |
| `bolt-elements-editor-search-backgroundColor` | `ca-elements-editor-search-backgroundColor` | 1 |
| `bolt-elements-editor-panels-borderColor` | `ca-elements-editor-panels-borderColor` | 1 |
| `bolt-elements-editor-gutter-backgroundColor` | `ca-elements-editor-gutter-backgroundColor` | 1 |
| `bolt-elements-editor-foldGutter-textColor` | `ca-elements-editor-foldGutter-textColor` | 1 |
| `bolt-elements-editor-cursorColor` | `ca-elements-editor-cursorColor` | 1 |
| `bolt-elements-editor-backgroundColor` | `ca-elements-editor-backgroundColor` | 1 |

## Data attributes

| Old | New | Occurrences |
|---|---|---:|
| `data-bolt-preview-bundle` | `data-ca-preview-bundle` | 7 |
| `data-bolt-preview-script` | `data-ca-preview-script` | 5 |
| `data-bolt-preview-bridge` | `data-ca-preview-bridge` | 4 |
| `data-bolt-preview$` | `data-ca-preview$` | 1 |
| `data-bolt-preview` | `data-ca-preview` | 1 |

## Icons (UnoCSS collection)

| Old | New | Occurrences |
|---|---|---:|
| `i-bolt:mcp` | `i-ca:mcp` | 2 |
| `i-bolt:vue` | `i-ca:vue` | 1 |
| `i-bolt:vite` | `i-ca:vite` | 1 |
| `i-bolt:typescript` | `i-ca:typescript` | 1 |
| `i-bolt:svelte` | `i-ca:svelte` | 1 |
| `i-bolt:stars` | `i-ca:stars` | 1 |
| `i-bolt:solidjs` | `i-ca:solidjs` | 1 |
| `i-bolt:slidev` | `i-ca:slidev` | 1 |
| `i-bolt:shadcn` | `i-ca:shadcn` | 1 |
| `i-bolt:remix` | `i-ca:remix` | 1 |
| `i-bolt:react` | `i-ca:react` | 1 |
| `i-bolt:qwik` | `i-ca:qwik` | 1 |
| `i-bolt:nextjs` | `i-ca:nextjs` | 1 |
| `i-bolt:expo-brand` | `i-ca:expo-brand` | 1 |
| `i-bolt:expo` | `i-ca:expo` | 1 |
| `i-bolt:astro` | `i-ca:astro` | 1 |
| `i-bolt:angular` | `i-ca:angular` | 1 |
| `i-bolt:$` | `i-ca:$` | 1 |

## Storage, IndexedDB and event keys

| Old | New | Occurrences |
|---|---|---:|
| `bolt_user_profile` | `ca_user_profile` | 11 |
| `boltHistory` | `caHistory` | 6 |
| `bolt_zip_autorun` | `ca_zip_autorun` | 5 |
| `bolt_tab_configuration` | `ca_tab_configuration` | 5 |
| `bolt_read_logs` | `ca_read_logs` | 5 |
| `bolt_profile` | `ca_profile` | 5 |
| `bolt_interface_options` | `ca_interface_options` | 5 |
| `bolt_performance_events` | `ca_performance_events` | 4 |
| `bolt_theme` | `ca_theme` | 3 |
| `bolt_acknowledged_connection_issue` | `ca_acknowledged_connection_issue` | 3 |
| `data.ui.bolt_tab_configuration` | `data.ui.ca_tab_configuration` | 2 |
| `bolt_viewed_features` | `ca_viewed_features` | 2 |
| `bolt_theme_$` | `ca_theme_$` | 2 |
| `bolt_settings` | `ca_settings` | 2 |
| `bolt_last_acknowledged_version` | `ca_last_acknowledged_version` | 2 |
| `bolt_acknowledged_debug_issues` | `ca_acknowledged_debug_issues` | 2 |
| `bolt-deleted-paths` | `ca-deleted-paths` | 2 |
| `bolt_project_type` | `ca_project_type` | 1 |
| `bolt_onboarding_completed` | `ca_onboarding_completed` | 1 |
| `bolt_marketplace_snapshot_v1` | `ca_marketplace_snapshot_v1` | 1 |
| `bolt_git_info` | `ca_git_info` | 1 |
| `bolt_developer_mode` | `ca_developer_mode` | 1 |
| `bolt_current_provider` | `ca_current_provider` | 1 |
| `bolt_current_model` | `ca_current_model` | 1 |
| `bolt_chat_history` | `ca_chat_history` | 1 |
| `boltDB` | `caDB` | 1 |
| `bolt:api-keys-updated` | `ca:api-keys-updated` | 1 |
| `bolt.lockedFiles` | `ca.lockedFiles` | 1 |

## Docker, desktop and deploy names

| Old | New | Occurrences |
|---|---|---:|
| `bolt-diy-$` | `ca-app-$` | 6 |
| `bolt-project` | `ca-project` | 3 |
| `bolt-ai-production` | `ca-ai-production` | 3 |
| `bolt-esbuild-preview` | `ca-esbuild-preview` | 2 |
| `bolt-ai:production` | `ca-ai:production` | 2 |
| `bolt-ai:latest` | `ca-ai:latest` | 2 |
| `bolt-ai:development` | `ca-ai:development` | 2 |
| `bolt-project-client` | `ca-project-client` | 1 |
| `bolt-preview-project` | `ca-preview-project` | 1 |
| `bolt-polyfill-regression-` | `ca-polyfill-regression-` | 1 |
| `bolt-debug-$` | `ca-debug-$` | 1 |
| `bolt-chat` | `ca-chat` | 1 |
| `bolt-browser-polyfills` | `ca-browser-polyfills` | 1 |
| `bolt-ai-live` | `ca-ai-live` | 1 |
| `bolt-ai` | `ca-ai` | 1 |

## Globals and constants (UPPER_CASE)

| Old | New | Occurrences |
|---|---|---:|
| `.__BOLT_UPLOADED_FILES__` | `.__CA_UPLOADED_FILES__` | 3 |
| `.__BOLT_SET_UPLOADED_FILES__` | `.__CA_SET_UPLOADED_FILES__` | 3 |
| `.__BOLT_SET_IMAGE_DATA_LIST__` | `.__CA_SET_IMAGE_DATA_LIST__` | 3 |
| `.__BOLT_IMAGE_DATA_LIST__` | `.__CA_IMAGE_DATA_LIST__` | 3 |
| `BOLT_QUICK_ACTIONS_OPEN` | `CA_QUICK_ACTIONS_OPEN` | 2 |
| `BOLT_QUICK_ACTIONS_CLOSE` | `CA_QUICK_ACTIONS_CLOSE` | 2 |
| `.__BOLT_PERFORMANCE__` | `.__CA_PERFORMANCE__` | 2 |
| `BOLT_QUICK_ACTIONS_OPEN.length` | `CA_QUICK_ACTIONS_OPEN.length` | 1 |
| `BOLT_QUICK_ACTIONS_CLOSE.length` | `CA_QUICK_ACTIONS_CLOSE.length` | 1 |
| `BOLT` | `CA` | 1 |
| `.__BOLT_STREAMING__` | `.__CA_STREAMING__` | 1 |
| `.__BOLT_PERFORMANCE__.monitor.recordMetric` | `.__CA_PERFORMANCE__.monitor.recordMetric` | 1 |

## Classes, types and functions

| Old | New | Occurrences |
|---|---|---:|
| `BoltShell` | `CaShell` | 25 |
| `BoltAction` | `CaAction` | 11 |
| `simplifyBoltActions` | `simplifyCaActions` | 10 |
| `escapeBoltTags` | `escapeCaTags` | 9 |
| `writeToBoltTerminal` | `writeToCaTerminal` | 7 |
| `BoltCloudflare` | `CaCloudflare` | 7 |
| `pendingBoltOutput` | `pendingCaOutput` | 6 |
| `newBoltShellProcess` | `newCaShellProcess` | 5 |
| `boltTerminal` | `caTerminal` | 5 |
| `BoltUIMessage` | `CaUIMessage` | 5 |
| `BoltToolState` | `CaToolState` | 5 |
| `BoltArtifactData` | `CaArtifactData` | 5 |
| `workbenchStore.writeToBoltTerminal` | `workbenchStore.writeToCaTerminal` | 4 |
| `boltOutputReady` | `caOutputReady` | 4 |
| `bBolt` | `bCa` | 4 |
| `BoltToolPart` | `CaToolPart` | 4 |
| `BoltPart` | `CaPart` | 4 |
| `BoltDataPart` | `CaDataPart` | 4 |
| `createBoltShell` | `createCaShell` | 3 |
| `BoltRouterContext` | `CaRouterContext` | 3 |
| `BoltFilePart` | `CaFilePart` | 3 |
| `BoltActionData` | `CaActionData` | 3 |
| `workbenchStore.attachBoltTerminal` | `workbenchStore.attachCaTerminal` | 2 |
| `useBoltHistoryDB` | `useCaHistoryDB` | 2 |
| `this.boltTerminal` | `this.caTerminal` | 2 |
| `store.boltTerminal.stop` | `store.caTerminal.stop` | 2 |
| `escapeBoltArtifactTags` | `escapeCaArtifactTags` | 2 |
| `escapeBoltAActionTags` | `escapeCaAActionTags` | 2 |
| `data.environmentInfo.boltVersion` | `data.environmentInfo.caVersion` | 2 |
| `attachBoltTerminal` | `attachCaTerminal` | 2 |
| `__boltProcess` | `__caProcess` | 2 |
| `__boltBuffer` | `__caBuffer` | 2 |
| `BoltTextPart` | `CaTextPart` | 2 |
| `BoltStepStartPart` | `CaStepStartPart` | 2 |
| `BoltSourcePart` | `CaSourcePart` | 2 |
| `BoltReasoningPart` | `CaReasoningPart` | 2 |
| `.__bolt_workbench_store` | `.__ca_workbench_store` | 2 |
| `this.newBoltShellProcess` | `this.newCaShellProcess` | 1 |
| `this.boltTerminal.terminal` | `this.caTerminal.terminal` | 1 |
| `this.boltTerminal.stop` | `this.caTerminal.stop` | 1 |
| `this.boltTerminal.executionState.get` | `this.caTerminal.executionState.get` | 1 |
| `terminalStore.writeToBoltTerminal` | `terminalStore.writeToCaTerminal` | 1 |
| `terminalStore.boltTerminal` | `terminalStore.caTerminal` | 1 |
| `terminalStore.attachBoltTerminal` | `terminalStore.attachCaTerminal` | 1 |
| `store.boltTerminal.executionState.set` | `store.caTerminal.executionState.set` | 1 |
| `boltVersion` | `caVersion` | 1 |
| `boltTerminal.terminal` | `caTerminal.terminal` | 1 |
| `boltTerminal.init` | `caTerminal.init` | 1 |
| `boltPlugins` | `caPlugins` | 1 |
| `__bolt` | `__ca` | 1 |
| `BoltShell.stop` | `CaShell.stop` | 1 |

## Standalone word bolt (CSS class, comments, collection name)

| Old | New | Occurrences |
|---|---|---:|
| `bolt` | `ca` | 52 |
| `/bolt/build` | `/ca/build` | 1 |

## Product name in comments and strings

| Old | New | Occurrences |
|---|---|---:|
| `Bolt` (except the 17 in default-engine prompt text, which stay) | `CodeApp AI (prose) / Ca (identifier part)` | 41 |
| `bolt.diy-app` | `codeapp-ai` | 24 |
| `Bolt.diy` | `CodeApp AI` | 16 |
| `bolt.diy` | `CodeApp AI` | 13 |
| `bolt.diy/1.0` | `codeapp-ai/1.0` | 1 |
| `bolt.diy-bug-reporter` | `codeapp-ai-bug-reporter` | 1 |
| `Bolt-owned` | `app-owned` | 1 |

## Kept (not renamed)

| Name | Occurrences | Reason |
|---|---:|---|
| `boltdiy.text-utilities` | 7 | external plugin marketplace repository and its plugin ids |
| `plugins/boltdiy/text-utilities/1.0.0/package.zip` | 1 | external plugin marketplace repository and its plugin ids |
| `plugins/boltdiy/text-utilities/1.0.0/manifest.json` | 1 | external plugin marketplace repository and its plugin ids |
| `plugins/boltdiy/text-utilities/1.0.0//manifest.json` | 1 | external plugin marketplace repository and its plugin ids |
| `plugins/boltdiy/text-utilities/../evil.json` | 1 | external plugin marketplace repository and its plugin ids |
| `bolt-marketplace` | 1 | external plugin marketplace repository and its plugin ids |
| `dustinwloring1988/bolt-marketplace` | 1 | external plugin marketplace repository and its plugin ids |
| `StackBlitz` | 6 | StackBlitz name in credits, copyright notices and history |
| `StackBlitz/i` | 2 | StackBlitz name in credits, copyright notices and history |
| `com.stackblitz.bolt.diy` | 1 | StackBlitz name in credits, copyright notices and history |
| `/StackBlitz/i` | 1 | StackBlitz name in credits, copyright notices and history |
| `.bolt` | 5 | template convention: starter repos ship a .bolt/ folder |
| `.bolt/prompt` | 1 | template convention: starter repos ship a .bolt/ folder |
| `blueberry-llm/bolt-astro-basic-template` | 2 | third-party starter template repositories |
| `bolt-astro-basic-template-main/package.json` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-vue-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-vite-ts-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-vite-react-ts-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-sveltekit-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-slidev-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-remix-ts-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-qwik-ts-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-nextjs-shadcn-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-expo-template` | 1 | third-party starter template repositories |
| `blueberry-llm/bolt-angular-template` | 1 | third-party starter template repositories |
| `stackblitz-labs/bolt-maintainers` | 14 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2210` | 11 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2209` | 11 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2214` | 6 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2211` | 4 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/releases/latest` | 3 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2217` | 3 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/issues/19` | 3 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy.git` | 3 | upstream URL / repository / owner (credit or external reference) |
| `https://bolt.diy` | 3 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2275` | 2 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2270` | 2 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2258` | 2 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2256` | 2 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2215` | 2 | upstream URL / repository / owner (credit or external reference) |
| `stackblitz-labs/bolt.diy` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/integrations/supabase` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/integrations/netlify` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/faqs/hosting` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/docs/prompting-effectively` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/docs/maximizing-token-efficiency` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://support.bolt.new/docs/how-to-create-mobile-apps` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://stackblitz.com` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/package.json` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz/bolt.new/issues/86` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/dustinwloring1988/bolt-marketplace` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://codeload.github.com/blueberry-llm/bolt-astro-basic-template/zip/refs/heads/main` | 1 | upstream URL / repository / owner (credit or external reference) |
| `ghcr.io/stackblitz-labs/bolt.diy:latest` | 1 | upstream URL / repository / owner (credit or external reference) |
| `stackblitz-labs` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://x.com/bolt_diy` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://thinktank.ottomator.ai/c/bolt-diy/17` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://stackblitz-labs.github.io/bolt.diy/` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz/webcontainer-core` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz/bolt.new/issues/new/choose` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/444` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2283` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2282` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2281` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2279` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2278` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2277` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2276` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2273` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2272` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2271` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2269` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2268` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2267` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2266` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2265` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2260` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2255` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2254` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2252` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2251` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2250` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2249` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2248` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2216` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2212` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/2208` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1688` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1685` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1682` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1681` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1677` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1676` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1651` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1644` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1625` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1618` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1614` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1613` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1602` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1601` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1598` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1590` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1586` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1582` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1577` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1570` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1569` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1567` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1559` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1549` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1537` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1483` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1472` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1466` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1461` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1451` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1449` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1436` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1428` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1411` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1403` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1381` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/pull/1136` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/labels/epic` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/stackblitz-labs/bolt.diy/compare/v0.0.7...v1.0.0` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://github.com/orgs/stackblitz-labs/projects/4` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://bsky.app/profile/bolt.diy` | 1 | upstream URL / repository / owner (credit or external reference) |
| `https://api.github.com/repos/stackblitz-labs/bolt.diy/releases/latest` | 1 | upstream URL / repository / owner (credit or external reference) |
| `Bolt.new` | 2 | the separate bolt.new product (URLs in the default discuss prompt) |
| `bolt.new` | 1 | the separate bolt.new product (URLs in the default discuss prompt) |
| `bolt.local` | 1 | external GitHub repository (electron publish target) |
| `/Bolt/i` | 1 | old-brand check in the brand tests (the e2e title check now expects CodeApp AI) |
| `license-bolt-diy` | 5 | test id of the bolt.diy credit on the /open-source page |
| `bolt-ai-development` | 3 | only in upstream docs, history or CI files (not renamed) |
| `window.__BOLT_STREAMING__.getStats` | 1 | only in upstream docs, history or CI files (not renamed) |
| `window.__BOLT_PERFORMANCE__.report` | 1 | only in upstream docs, history or CI files (not renamed) |
| `bolt.diy/` | 1 | only in upstream docs, history or CI files (not renamed) |
| `BoltDIY` | 1 | only in upstream docs, history or CI files (not renamed) |
| `Bolt.DIY` | 1 | only in upstream docs, history or CI files (not renamed) |
| `bolt-theme` | 2 | upstream documentation site (docs/) |
| `/bolt.diy/.env.example` | 1 | upstream documentation site (docs/) |

## Kept on purpose (whole files or fields)

| Where | Why |
|---|---|
| `LICENSE`, `/open-source` page and its test | MIT credit and copyright must name bolt.diy and StackBlitz, Inc. |
| `package.json` author (`bolt.diy team`) | upstream credit; the package `name` is now `codeapp-ai` |
| Default-engine prompt text ("You are Bolt…", support.bolt.new links) | prompts must stay word-for-word; only the shared tags were renamed |
| `app/lib/common/prompts/__fixtures__/pre-rename-prompts/` | frozen copy of the prompts before the rename, used by `default-prompts.spec.ts` |
| `app/lib/persistence/legacyTags.ts` (+ spec) | converts the old tag names in saved chats |
| `docs/`, `changelog.md`, `CHANGES.md`, `FAQ.md`, `CONTRIBUTING.md`, `PROJECT.md`, `README.md` (after the intro) | upstream documentation and history |
| `.github/` (CODEOWNERS, issue templates, changelog script, preview comment) | upstream maintainers and links; only the Docker target name was renamed |
| `scripts/update.sh`, `electron-update.yml` | update from upstream releases |
| `app/lib/hooks/StickToBottom.tsx`, `useStickToBottom.tsx` | third-party copyright notice |
| Brand tests (`brand.spec.ts`, `Header.spec.tsx`, `esbuild-preview.spec.ts`) | they check the old names are gone from the UI |

## Worker rename (later)

`wrangler.jsonc` `name` and `package.json` `name` changed from `bolt` to `codeapp-ai`, the name of
our Cloudflare Worker.

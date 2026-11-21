/**
 * Builds the HTML document shown in the preview iframe. Pure function.
 */

export const TAILWIND_CDN_URL = 'https://cdn.tailwindcss.com';

export interface PreviewHtmlInput {
  /** The compiled ES module. */
  js: string;

  /** All project CSS. */
  css: string;

  /** The project's index.html, if it has one. */
  indexHtml?: string;

  /** Extra script text to run before the app (for example the inspector). */
  previewScript?: string;
  usesTailwind?: boolean;
}

const DEFAULT_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

/**
 * Makes text safe inside `<script>`: a `</script` (or `<!--`, which can make
 * the HTML parser miss the real end tag) can never appear literally.
 * `\x3C` is `<` in JS strings, templates and regular expressions; esbuild
 * prints code-level `<` with spaces around it, so these sequences only occur
 * inside such literals or comments.
 */
export function escapeScriptContent(text: string): string {
  return text.replace(/<(?=\/script|!--)/gi, '\\x3C');
}

/** Makes text safe inside `<style>`. `\/` is a valid CSS escape for `/`. */
export function escapeStyleContent(text: string): string {
  return text.replace(/<\/(?=style)/gi, '<\\/');
}

/** Removes `<script type="module" src="...">` tags that point to project files (the entry). */
export function removeLocalModuleScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attributes: string) => {
    const isModule = /\btype\s*=\s*["']?module\b/i.test(attributes);
    const src = attributes.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = src?.[1] ?? src?.[2] ?? src?.[3];

    return isModule && value && !/^(https?:)?\/\//i.test(value) ? '' : tag;
  });
}

function insertBefore(html: string, closingTag: RegExp, content: string, fallback: (html: string) => string) {
  const match = closingTag.exec(html);

  if (!match) {
    return fallback(html);
  }

  return html.slice(0, match.index) + content + html.slice(match.index);
}

export function renderPreviewHtml({ js, css, indexHtml, previewScript, usesTailwind }: PreviewHtmlInput): string {
  const base = indexHtml?.trim() ? removeLocalModuleScripts(indexHtml) : DEFAULT_DOCUMENT;

  const head: string[] = [];

  if (usesTailwind) {
    head.push(`<script src="${TAILWIND_CDN_URL}"></script>`);
  }

  // the Tailwind browser script compiles `text/tailwindcss` styles (handles @tailwind and @apply)
  head.push(
    `<style data-bolt-preview${usesTailwind ? ' type="text/tailwindcss"' : ''}>\n${escapeStyleContent(css)}\n</style>`,
  );

  if (previewScript) {
    head.push(`<script data-bolt-preview-script>\n${escapeScriptContent(previewScript)}\n</script>`);
  }

  const bundle = `<script type="module" data-bolt-preview-bundle>\n${escapeScriptContent(js)}\n</script>`;

  let html = insertBefore(base, /<\/head\s*>/i, `${head.join('\n')}\n`, (doc) =>
    /<body\b/i.test(doc)
      ? doc.replace(/<body\b/i, `<head>\n${head.join('\n')}\n</head>\n<body`)
      : head.join('\n') + doc,
  );

  html = insertBefore(html, /<\/body\s*>(?![\s\S]*<\/body\s*>)/i, `${bundle}\n`, (doc) => `${doc}\n${bundle}`);

  return html;
}

import { describe, expect, it } from 'vitest';
import { TAILWIND_CDN_URL, escapeScriptContent, renderPreviewHtml } from './html-template';

/** Extracts the text of the script tag carrying `marker`, the way an HTML parser would end it. */
function scriptText(html: string, marker: string) {
  const start = html.indexOf('>', html.indexOf(marker)) + 1;

  // an HTML parser ends a script at the first `</script` followed by whitespace, `/` or `>`
  return { start, end: html.slice(start).search(/<\/script[\s/>]/i) + start };
}

describe('renderPreviewHtml', () => {
  it('uses a default shell with #root when there is no index.html', () => {
    const html = renderPreviewHtml({ js: 'console.log("app")', css: '.a{color:red}' });

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('.a{color:red}');
    expect(html).toContain('<script type="module" data-bolt-preview-bundle>\nconsole.log("app")\n</script>');
    expect(html).not.toContain(TAILWIND_CDN_URL);
    expect(html.match(/<style/g)).toHaveLength(1);
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('data-bolt-preview-bundle')).toBeGreaterThan(html.indexOf('<div id="root">'));
  });

  it('keeps the project index.html title and body but removes its entry script', () => {
    const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>My Shop</title>
    <script src="https://cdn.example.com/analytics.js"></script>
  </head>
  <body class="dark">
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

    const html = renderPreviewHtml({ js: 'run()', css: '', indexHtml });

    expect(html).toContain('<title>My Shop</title>');
    expect(html).toContain('<body class="dark">');
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('https://cdn.example.com/analytics.js');
    expect(html).not.toContain('/src/main.tsx');
    expect(html).not.toContain('id="root"');
    expect(html.indexOf('data-bolt-preview-bundle')).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('adds the Tailwind browser script and marks the CSS for it', () => {
    const html = renderPreviewHtml({ js: '', css: '@tailwind base;', usesTailwind: true });

    expect(html).toContain(`<script src="${TAILWIND_CDN_URL}"></script>`);
    expect(html).toContain('<style data-bolt-preview type="text/tailwindcss">');
    expect(html.indexOf(TAILWIND_CDN_URL)).toBeLessThan(html.indexOf('<style'));
  });

  it('adds the preview script in its own tag before the bundle', () => {
    const html = renderPreviewHtml({ js: 'app()', css: '', previewScript: 'window.inspector = 1;' });

    expect(html).toContain('<script data-bolt-preview-script>\nwindow.inspector = 1;\n</script>');
    expect(html.indexOf('data-bolt-preview-script')).toBeLessThan(html.indexOf('data-bolt-preview-bundle'));
  });

  it('never lets </script> inside the bundle or the preview script end the tag early', () => {
    const js = 'const a = "</script><script>alert(1)</script>"; const b = `</SCRIPT >`; // <!-- <script>';
    const previewScript = 'document.write("</script>")';

    const html = renderPreviewHtml({ js, css: '</style><script>x()</script>', previewScript });

    // each tag ends exactly where our own closing tag is
    for (const [marker, expected] of [
      ['data-bolt-preview-bundle', escapeScriptContent(js)],
      ['data-bolt-preview-script', escapeScriptContent(previewScript)],
    ]) {
      const { start, end } = scriptText(html, marker);
      expect(html.slice(start, end)).toBe(`\n${expected}\n`);
    }

    expect(html).not.toMatch(/<\/script><script>alert/i);
    expect(html.match(/<\/style/gi)).toHaveLength(1);

    // the escaped text still means the same thing to JavaScript
    expect(new Function(`${escapeScriptContent('return "</script>";')}`)()).toBe('</script>');
    expect(new Function(`${escapeScriptContent('return /<!--x/.test("<!--x");')}`)()).toBe(true);
  });
});

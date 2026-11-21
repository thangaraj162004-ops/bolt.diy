import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS, replaceHeading } from './demo-projects';
import { buildProject, projectFilesFromRecord } from '~/lib/webcontainer/shim/preview/compiler';

/* Compiles every demo with the real esbuild-wasm. No network: React stays an esm.sh URL. */

describe('demo projects', () => {
  it('has the five demos', () => {
    expect(DEMO_PROJECTS.map((project) => project.id)).toEqual([
      'counter',
      'todo',
      'tailwind',
      'runtime-error',
      'compile-error',
    ]);
  });

  it.each(DEMO_PROJECTS.filter((project) => project.id !== 'compile-error').map((project) => [project.id, project]))(
    '%s compiles',
    async (_id, project) => {
      const result = await buildProject({ files: projectFilesFromRecord(project.files) });

      expect(result.entry).toBe('src/main.tsx');
      expect(result.js).toContain('https://esm.sh/react-dom@18.3.1/client');
    },
  );

  it('tailwind uses Tailwind (package.json and @tailwind CSS)', async () => {
    const project = DEMO_PROJECTS.find((demo) => demo.id === 'tailwind')!;
    const result = await buildProject({ files: projectFilesFromRecord(project.files) });

    expect(result.usesTailwind).toBe(true);
    expect(result.css).toContain('@tailwind utilities');
    expect(project.files['src/App.tsx']).toContain('className="text-2xl font-bold text-indigo-600"');
  });

  it('compile-error fails with the missing file and its line', async () => {
    const project = DEMO_PROJECTS.find((demo) => demo.id === 'compile-error')!;

    await expect(buildProject({ files: projectFilesFromRecord(project.files) })).rejects.toThrow(
      /src\/App\.tsx:1:\d+: Could not resolve "\.\/components\/Missing"/,
    );
  });

  it('runtime-error throws on click', () => {
    const project = DEMO_PROJECTS.find((demo) => demo.id === 'runtime-error')!;
    expect(project.files['src/App.tsx']).toContain("throw new Error('Demo error: the button exploded')");
  });

  it('every demo has a plain <h1> that "Edit heading" can change', () => {
    for (const project of DEMO_PROJECTS) {
      const edited = replaceHeading(project.files['src/App.tsx'], 'Edited at 12:00:00');

      expect(edited, project.id).toBeDefined();
      expect(edited).toContain('>Edited at 12:00:00</h1>');
    }

    expect(replaceHeading('<h1>{title}</h1>', 'x')).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OpenSourceRoute, { meta } from './open-source';
import { OpenSourceFooterLink } from '~/components/open-source/OpenSourceFooterLink';

// tests run from the repository root
const LICENSE = readFileSync(join(process.cwd(), 'LICENSE'), 'utf-8').trim();

describe('/open-source', () => {
  it('names CodeApp AI and credits bolt.diy with its copyright line', () => {
    const { container } = render(<OpenSourceRoute />);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Open source notices');
    expect(text).toContain('CodeApp AI is built on bolt.diy (MIT license)');
    expect(text).toContain('Copyright (c) 2024 StackBlitz, Inc. and bolt.diy contributors');
    expect(text).toContain('Bolt and StackBlitz names and logos belong to their owners and are not used as our brand.');
  });

  it('shows the full MIT license text from the repository LICENSE file', () => {
    render(<OpenSourceRoute />);

    const license = screen.getByTestId('license-bolt-diy').textContent ?? '';
    expect(license).toBe(LICENSE);
    expect(license).toContain('MIT License');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  it('lists esbuild-wasm with its MIT license', () => {
    const { container } = render(<OpenSourceRoute />);
    const esbuild = screen.getByTestId('license-esbuild-wasm').textContent ?? '';

    expect(container.textContent).toContain('MIT License, Copyright (c) 2020 Evan Wallace');
    expect(esbuild).toContain('Copyright (c) 2020 Evan Wallace');
    expect(esbuild).toContain('Permission is hereby granted, free of charge');
  });

  it('wraps long license lines so it works on phones', () => {
    render(<OpenSourceRoute />);
    expect(screen.getByTestId('license-bolt-diy').className).toContain('whitespace-pre-wrap');
  });

  it('has a CodeApp AI page title', () => {
    expect(meta({} as never)).toEqual([{ title: 'Open source notices | CodeApp AI' }]);
  });

  it('is linked from the start page footer', () => {
    render(<OpenSourceFooterLink />);

    const link = screen.getByTestId('open-source-footer-link');
    expect(link.getAttribute('href')).toBe('/open-source');
    expect(link.textContent).toBe('Open source notices');
  });
});

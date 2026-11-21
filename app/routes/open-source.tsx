import type { MetaFunction } from 'react-router';
import esbuildWasmLicense from 'esbuild-wasm/LICENSE.md?raw';
import { OpenSourceNotices, type OpenSourceComponent } from '~/components/open-source/OpenSourceNotices';
import { pageTitle } from '~/lib/brand';
import projectLicense from '/LICENSE?raw';

/*
 * /open-source: the attribution required by the MIT licenses of bolt.diy (this
 * repository's LICENSE file) and esbuild-wasm. The texts are read from the
 * license files at build time, so they always match.
 */

export const meta: MetaFunction = () => [{ title: pageTitle('Open source notices') }];

export const OPEN_SOURCE_COMPONENTS: OpenSourceComponent[] = [
  {
    name: 'esbuild-wasm',
    license: 'MIT License',
    copyright: 'Copyright (c) 2020 Evan Wallace',
    url: 'https://github.com/evanw/esbuild',
    licenseText: esbuildWasmLicense,
  },
];

export default function OpenSourceRoute() {
  return <OpenSourceNotices projectLicense={projectLicense} components={OPEN_SOURCE_COMPONENTS} />;
}

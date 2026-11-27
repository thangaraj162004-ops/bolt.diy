import { PRODUCT_NAME } from '~/lib/brand';

export interface OpenSourceComponent {
  name: string;
  license: string;
  copyright: string;
  url: string;
  licenseText: string;
}

interface OpenSourceNoticesProps {
  /** The full text of this repository's LICENSE file (bolt.diy, MIT). */
  projectLicense: string;
  components: OpenSourceComponent[];
}

/** Plain-text open source notices. Readable on phones: wrapped preformatted text, no wide layout. */
export function OpenSourceNotices({ projectLicense, components }: OpenSourceNoticesProps) {
  return (
    <main className="min-h-full w-full overflow-y-auto bg-ca-elements-background-depth-1 text-ca-elements-textPrimary">
      <article className="mx-auto max-w-3xl px-4 py-6 text-sm leading-relaxed">
        <a href="/" className="text-ca-elements-textSecondary underline">
          Back to {PRODUCT_NAME}
        </a>

        <h1 className="mt-4 text-2xl font-semibold">Open source notices</h1>

        <p className="mt-3">
          {PRODUCT_NAME} is built on bolt.diy (MIT license), Copyright (c) 2024 StackBlitz, Inc. and bolt.diy
          contributors.
        </p>
        <p className="mt-3">
          Bolt and StackBlitz names and logos belong to their owners and are not used as our brand. {PRODUCT_NAME} is
          not affiliated with or endorsed by StackBlitz, Inc.
        </p>

        <section aria-labelledby="license-bolt-diy" className="mt-6">
          <h2 id="license-bolt-diy" className="text-lg font-semibold">
            bolt.diy
          </h2>
          <p className="text-ca-elements-textSecondary">MIT License</p>
          <pre
            data-testid="license-bolt-diy"
            className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 p-3 font-mono text-xs"
          >
            {projectLicense.trim()}
          </pre>
        </section>

        {components.map((component) => (
          <section key={component.name} aria-labelledby={`license-${component.name}`} className="mt-6">
            <h2 id={`license-${component.name}`} className="text-lg font-semibold">
              {component.name}
            </h2>
            <p className="text-ca-elements-textSecondary">
              {component.license}, {component.copyright} — {component.url}
            </p>
            <pre
              data-testid={`license-${component.name}`}
              className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 p-3 font-mono text-xs"
            >
              {component.licenseText.trim()}
            </pre>
          </section>
        ))}
      </article>
    </main>
  );
}

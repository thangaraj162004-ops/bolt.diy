/**
 * The product's visible name. Internal names (boltArtifact/boltAction tags,
 * BoltShell, CSS classes, storage keys, API routes, package and Worker names)
 * intentionally stay as they are.
 */
export const PRODUCT_NAME = 'CodeWriterAI';

export const PRODUCT_TAGLINE = 'A website and app builder';

export const PRODUCT_DESCRIPTION =
  'CodeWriterAI is a website and app builder: describe what you want and it builds it.';

/** A page title: "Page | CodeWriterAI", or just the product name. */
export function pageTitle(page?: string) {
  return page ? `${page} | ${PRODUCT_NAME}` : PRODUCT_NAME;
}

/** The chat input placeholder for build and discuss mode. */
export function chatPlaceholder(chatMode?: 'build' | 'discuss' | string) {
  return chatMode === 'build' ? `How can ${PRODUCT_NAME} help you today?` : 'What would you like to discuss?';
}

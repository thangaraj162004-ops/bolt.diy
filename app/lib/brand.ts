/**
 * The product's visible name. Internal names (caArtifact/caAction tags,
 * CaShell, CSS classes, storage keys, API routes, package and Worker names)
 * intentionally stay as they are.
 */
export const PRODUCT_NAME = 'CodeApp AI';

export const PRODUCT_TAGLINE = 'A website and app builder';

export const PRODUCT_DESCRIPTION = 'CodeApp AI is a website and app builder: describe what you want and it builds it.';

/** A page title: "Page | CodeApp AI", or just the product name. */
export function pageTitle(page?: string) {
  return page ? `${page} | ${PRODUCT_NAME}` : PRODUCT_NAME;
}

/** The chat input placeholder for build and discuss mode. */
export function chatPlaceholder(chatMode?: 'build' | 'discuss' | string) {
  return chatMode === 'build' ? `How can ${PRODUCT_NAME} help you today?` : 'What would you like to discuss?';
}

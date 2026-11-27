/** Small footer link to /open-source, shown on the start page (easy to find on phones). */
export function OpenSourceFooterLink() {
  return (
    <p className="pb-4 text-center text-xs text-ca-elements-textTertiary">
      <a
        href="/open-source"
        data-testid="open-source-footer-link"
        className="underline hover:text-ca-elements-textPrimary"
      >
        Open source notices
      </a>
    </p>
  );
}

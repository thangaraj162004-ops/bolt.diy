import { PRODUCT_NAME } from '~/lib/brand';
import { classNames } from '~/utils/classNames';

interface BrandWordmarkProps {
  className?: string;
}

/**
 * The CodeWriterAI text wordmark. "CodeWriter" uses the theme's primary text
 * colour and "AI" the accent colour, so it works in light and dark mode.
 */
export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={classNames('inline-flex items-baseline font-bold tracking-tight leading-none select-none', className)}
      aria-label={PRODUCT_NAME}
      data-testid="brand-wordmark"
    >
      <span aria-hidden="true" className="text-bolt-elements-textPrimary">
        CodeWriter
      </span>
      <span aria-hidden="true" className="text-accent-600">
        AI
      </span>
    </span>
  );
}

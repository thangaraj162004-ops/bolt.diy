import { memo } from 'react';
import { IconButton } from '~/components/ui/IconButton';
interface SettingsButtonProps {
  onClick: () => void;
}

export const SettingsButton = memo(({ onClick }: SettingsButtonProps) => {
  return (
    <IconButton
      onClick={onClick}
      icon="i-ph:gear"
      size="xl"
      title="Preferences"
      data-testid="settings-button"
      className="text-[#666] hover:text-ca-elements-textPrimary hover:bg-ca-elements-item-backgroundActive/10 transition-colors"
    />
  );
});

/** Small icon link to the open source notices page (/open-source). */
export const OpenSourceNoticesLink = memo(() => {
  return (
    <a
      href="/open-source"
      title="Open source notices"
      aria-label="Open source notices"
      data-testid="open-source-link"
      className="flex items-center justify-center rounded-md p-1 text-xl text-[#666] hover:text-ca-elements-textPrimary hover:bg-ca-elements-item-backgroundActive/10 transition-colors"
    >
      <span className="i-ph:scales" />
    </a>
  );
});

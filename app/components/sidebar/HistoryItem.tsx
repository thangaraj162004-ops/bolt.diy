import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ForwardedRef, useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { Checkbox } from '~/components/ui/Checkbox';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { db, prefetchChat, type ChatHistoryItem } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onDuplicate?: (id: string) => void;
  exportChat: (id?: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;

  /** Shows a small cloud: there is a copy online. */
  savedOnline?: boolean;

  /** Opens it another way than the link (an online copy may be downloaded first). */
  onOpen?: () => void;
}

export function HistoryItem({
  item,
  onDelete,
  onDuplicate,
  exportChat,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  savedOnline = false,
  onOpen,
}: HistoryItemProps) {
  const { id: urlId } = useParams();
  const isActiveChat = urlId === item.urlId;

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription: item.description,
      customChatId: item.id,
      syncWithGlobalStore: isActiveChat,
    });

  const handleItemClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectionMode) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Item clicked in selection mode:', item.id);
        onToggleSelection?.(item.id);
      }
    },
    [selectionMode, item.id, onToggleSelection],
  );

  const handleCheckboxChange = useCallback(() => {
    console.log('Checkbox changed for item:', item.id);
    onToggleSelection?.(item.id);
  }, [item.id, onToggleSelection]);

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('Delete button clicked for item:', item.id);

      if (onDelete) {
        onDelete(event as unknown as React.UIEvent);
      }
    },
    [onDelete, item.id],
  );

  return (
    <div
      className={classNames(
        'group rounded-lg text-sm text-ca-elements-textSecondary hover:text-ca-elements-textPrimary hover:bg-ca-elements-item-backgroundActive overflow-hidden flex justify-between items-center px-3 py-2 max-md:py-0 max-md:pr-0 max-md:min-h-11 transition-colors',
        { 'text-ca-elements-textPrimary bg-ca-elements-item-backgroundActive': isActiveChat },
        { 'cursor-pointer': selectionMode },
      )}
      onClick={selectionMode ? handleItemClick : undefined}
      onMouseEnter={() => prefetchChat(db, item.urlId || item.id)}
    >
      {selectionMode && (
        <div className="flex items-center mr-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            id={`select-${item.id}`}
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            className="h-4 w-4"
          />
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-ca-elements-background-depth-2 text-ca-elements-textPrimary rounded-md px-3 py-1.5 text-sm border border-ca-elements-borderColor focus:outline-none focus:ring-1 focus:ring-ca-elements-borderColorActive/50"
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="i-ph:check h-4 w-4 text-gray-500 hover:text-purple-500 transition-colors"
            onMouseDown={handleSubmit}
          />
        </form>
      ) : (
        <Link
          to={`/chat/${item.urlId}`}
          className="flex w-full relative truncate block"
          onClick={
            selectionMode
              ? handleItemClick
              : onOpen
                ? (event) => {
                    event.preventDefault();
                    onOpen();
                  }
                : undefined
          }
        >
          {savedOnline && (
            <span
              className="i-ph:cloud-check mr-1.5 shrink-0 self-center text-ca-elements-textTertiary"
              role="img"
              aria-label="Saved online"
              title="Saved online"
              data-testid="saved-online"
            />
          )}
          <WithTooltip tooltip={currentDescription}>
            <span className="truncate pr-24 max-md:pr-2">{currentDescription}</span>
          </WithTooltip>
          <div
            className={classNames(
              'absolute right-0 top-0 bottom-0 flex items-center bg-transparent px-2 transition-colors',
            )}
          >
            <div className="max-md:hidden flex items-center gap-2.5 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChatActionButton
                toolTipContent="Export"
                icon="i-ph:download-simple h-4 w-4"
                onClick={(event) => {
                  event.preventDefault();
                  exportChat(item.id);
                }}
              />
              {onDuplicate && (
                <ChatActionButton
                  toolTipContent="Duplicate"
                  icon="i-ph:copy h-4 w-4"
                  onClick={(event) => {
                    event.preventDefault();
                    onDuplicate?.(item.id);
                  }}
                />
              )}
              <ChatActionButton
                toolTipContent="Rename"
                icon="i-ph:pencil-fill h-4 w-4"
                onClick={(event) => {
                  event.preventDefault();
                  toggleEditMode();
                }}
              />
              <ChatActionButton
                toolTipContent="Delete"
                icon="i-ph:trash h-4 w-4"
                className="hover:text-red-500 dark:hover:text-red-400"
                onClick={handleDeleteClick}
              />
            </div>
          </div>
        </Link>
      )}

      {/* phone: there is no hover, so the chat actions are in a "⋯" menu */}
      {!editing && !selectionMode && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`Actions for ${currentDescription}`}
            data-testid="chat-actions"
            className="md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent text-ca-elements-textSecondary"
          >
            <span className="i-ph:dots-three-bold text-xl" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              collisionPadding={16}

              // keep focus away from the trigger, so "Rename" can focus its text box
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="z-[1000] min-w-[180px] max-w-[calc(100vw-32px)] rounded-xl border border-ca-elements-borderColor bg-ca-elements-background-depth-1 p-1 shadow-lg"
            >
              <PhoneAction icon="i-ph:download-simple" onSelect={() => exportChat(item.id)}>
                Export
              </PhoneAction>
              {onDuplicate && (
                <PhoneAction icon="i-ph:copy" onSelect={() => onDuplicate(item.id)}>
                  Duplicate
                </PhoneAction>
              )}
              <PhoneAction icon="i-ph:pencil-simple" onSelect={toggleEditMode}>
                Rename
              </PhoneAction>
              <PhoneAction
                icon="i-ph:trash"
                danger
                onSelect={() => onDelete?.({ preventDefault: noop, stopPropagation: noop } as unknown as React.UIEvent)}
              >
                Delete
              </PhoneAction>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

const noop = () => undefined;

function PhoneAction({
  icon,
  danger,
  onSelect,
  children,
}: {
  icon: string;
  danger?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={classNames(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-ca-elements-item-backgroundActive',
        danger ? 'text-red-500' : 'text-ca-elements-textPrimary',
      )}
    >
      <span className={`${icon} text-lg`} aria-hidden="true" />
      {children}
    </DropdownMenu.Item>
  );
}

const ChatActionButton = forwardRef(
  (
    {
      toolTipContent,
      icon,
      className,
      onClick,
    }: {
      toolTipContent: string;
      icon: string;
      className?: string;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      btnTitle?: string;
    },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <WithTooltip tooltip={toolTipContent} position="bottom" sideOffset={4}>
        <button
          ref={ref}
          type="button"
          className={`text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors ${icon} ${className ? className : ''}`}
          onClick={onClick}
        />
      </WithTooltip>
    );
  },
);

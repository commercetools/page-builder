import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, Flex, Button, IconButton, Card } from '@commercetools/nimbus';
import type { SchemaField } from '../../types';
import Icon from '../icon';
import messages from '../../messages';
import { SchemaFieldEditor } from './schema-field-editor';

let groupItemSeq = 0;
const newGroupItemKey = () => `gi-${(groupItemSeq += 1)}`;

export function GroupFieldEditor({
  field,
  value,
  onChange,
}: {
  field: SchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const intl = useIntl();
  const children = field.children ?? [];
  const items = (Array.isArray(value) ? value : []) as Record<
    string,
    unknown
  >[];

  // Group items are anonymous objects, so React has nothing stable to key the
  // cards by. Keying by index means deleting a middle item shifts every later
  // row onto the previous row's DOM node, carrying focus, caret position and
  // rich-text editor state onto the wrong entry. Track a generated key per row
  // instead, moved in step with the add/delete handlers. The call site remounts
  // this editor per component, so the list only drifts if `items` is replaced
  // wholesale from elsewhere; `keyAt` then falls back to the index for the rows
  // it has no key for, which is no worse than the old behaviour.
  const [itemKeys, setItemKeys] = useState<string[]>(() =>
    items.map(newGroupItemKey)
  );
  const keyAt = (i: number) => itemKeys[i] ?? `pos-${i}`;

  const addItem = () => {
    const empty: Record<string, unknown> = {};
    for (const child of children) {
      empty[child.key] =
        child.kind === 'boolean' ? false : child.localized ? {} : '';
    }
    setItemKeys((prev) => [...prev, newGroupItemKey()]);
    onChange([...items, empty]);
  };

  const updateItem = (i: number, updated: Record<string, unknown>) =>
    onChange(items.map((it, j) => (j === i ? updated : it)));

  const deleteItem = (i: number) => {
    setItemKeys((prev) => prev.filter((_, j) => j !== i));
    onChange(items.filter((_, j) => j !== i));
  };

  const label =
    typeof field.label === 'string'
      ? field.label
      : Object.values(field.label)[0] ?? field.key;

  return (
    <Flex direction="column" gap={150}>
      <Flex align="center" justify="space-between">
        <Box as="span" fontSize={300} fontWeight={600} color="neutral.12">
          {label}
        </Box>
        <Button variant="ghost" size="sm" onPress={addItem}>
          <Icon name="Add" size={13} color="primary.11" />{' '}
          {intl.formatMessage(messages.fieldEditorAddItem)}
        </Button>
      </Flex>
      {items.length === 0 && (
        <Box
          p={300}
          textAlign="center"
          border="1px dashed"
          borderColor="neutral.6"
          borderRadius={150}
          color="neutral.9"
          fontSize={300}
        >
          {intl.formatMessage(messages.fieldEditorNoItems)}
        </Box>
      )}
      {items.map((item, i) => (
        <Card.Root key={keyAt(i)} variant="outlined-elevated-muted">
          <Card.Body>
            <Box
              display="flex"
              width={'full'}
              justifyContent={'space-between'}
              alignItems={'center'}
            >
              <Box
                fontSize={11}
                fontWeight={600}
                color="neutral.9"
                textTransform="uppercase"
                letterSpacing="0.06em"
              >
                {intl.formatMessage(messages.fieldEditorItemLabel, {
                  index: i + 1,
                })}
              </Box>
              <IconButton
                aria-label={intl.formatMessage(messages.fieldEditorRemoveItem)}
                variant="ghost"
                size="xs"
                onPress={() => deleteItem(i)}
                flexShrink={0}
                alignSelf="flex-start"
              >
                <Icon name="DeleteOutline" size={14} color="critical.9" />
              </IconButton>
            </Box>
            <Flex direction="column" flex={1} gap={200} minWidth={0}>
              {children.map((child, childIdx) => (
                <SchemaFieldEditor
                  key={childIdx}
                  field={child}
                  value={item[child.key]}
                  onChange={(v) => updateItem(i, { ...item, [child.key]: v })}
                />
              ))}
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </Flex>
  );
}

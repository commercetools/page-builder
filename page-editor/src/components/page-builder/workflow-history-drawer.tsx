import { formatDistanceToNow } from 'date-fns';
import { Drawer } from '@commercetools-frontend/application-components';
import { Badge, Box, Flex } from '@commercetools/nimbus';
import Icon from './shared/icon';
import type {
  WorkflowActionKind,
  WorkflowTransition,
} from '../workflows/types';

type ActionMeta = {
  label: string;
  icon: string;
  color: 'critical' | 'positive' | 'info';
};

const actionMeta = (action: WorkflowActionKind): ActionMeta => {
  switch (action) {
    case 'reject':
      return { label: 'Rejected', icon: 'Undo', color: 'critical' };
    case 'publish':
      return { label: 'Published', icon: 'RocketLaunch', color: 'positive' };
    case 'start':
      return { label: 'Submitted', icon: 'Send', color: 'info' };
    default:
      return { label: 'Advanced', icon: 'ArrowForward', color: 'info' };
  }
};

/**
 * Stable identity for a transition. Nothing persists an id, but a page can only
 * move between two positions once per instant, so the timestamp + the position
 * pair uniquely identifies a row — and stays put as newer entries are prepended.
 */
const transitionKey = (t: WorkflowTransition): string =>
  `${t.at}|${t.fromPosition}|${t.toPosition}`;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workflowName?: string;
  history: WorkflowTransition[];
};

/** Shows the full, append-only transition history + reject comments for a page. */
export const WorkflowHistoryDrawer = ({
  isOpen,
  onClose,
  workflowName,
  history,
}: Props) => {
  const items = [...history].reverse();

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      size={20}
      title="Workflow history"
      hideControls
    >
      <Flex direction="column" gap={200}>
        {workflowName && (
          <Box fontSize="12px" color="neutral.10" mb={100}>
            {workflowName}
          </Box>
        )}
        {items.length === 0 ? (
          <Box color="neutral.9" fontSize="13px">
            No workflow activity yet.
          </Box>
        ) : (
          items.map((t) => {
            const meta = actionMeta(t.action);
            return (
              <Flex
                key={transitionKey(t)}
                direction="column"
                gap={100}
                p={300}
                border="solid-25"
                borderColor="neutral.6"
                borderRadius={200}
                bg="neutral.1"
              >
                <Flex align="center" gap={150}>
                  <Icon name={meta.icon} size={14} color={`${meta.color}.11`} />
                  <Badge size="2xs" colorPalette={meta.color}>
                    {meta.label}
                  </Badge>
                  <Box flex={1} />
                  <Box fontSize="10.5px" color="neutral.9">
                    {formatDistanceToNow(new Date(t.at), { addSuffix: true })}
                  </Box>
                </Flex>
                <Box fontSize="12.5px" fontWeight={600} color="neutral.12">
                  {t.fromLabel} → {t.toLabel}
                </Box>
                <Box fontSize="11px" color="neutral.10">
                  by {t.actor.name}
                </Box>
                {t.comment && (
                  <Box
                    mt={100}
                    fontSize="12px"
                    color="neutral.11"
                    bg="neutral.2"
                    borderRadius={100}
                    p={200}
                    whiteSpace="pre-wrap"
                  >
                    {t.comment}
                  </Box>
                )}
              </Flex>
            );
          })
        )}
      </Flex>
    </Drawer>
  );
};

export default WorkflowHistoryDrawer;

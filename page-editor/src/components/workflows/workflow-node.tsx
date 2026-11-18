import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Box,
  Flex,
  IconButton,
  Select,
  TextInput,
} from '@commercetools/nimbus';
import Icon from '../page-builder/shared/icon';
import type { OrgTeam } from '../../hooks/use-org-directory';
import type { WorkflowStep } from './types';

export type StepNodeData = {
  step: WorkflowStep;
  teams: OrgTeam[];
  onUpdate: (id: string, patch: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
};

const Pill = ({
  label,
  icon,
  tone,
}: {
  label: string;
  icon: string;
  tone: 'start' | 'finish';
}) => (
  <Flex
    align="center"
    gap={100}
    px={300}
    py={200}
    borderRadius={300}
    bg={tone === 'finish' ? 'primary.9' : 'neutral.12'}
    color="neutral.1"
    fontSize="12px"
    fontWeight={700}
  >
    <Icon name={icon} size={14} color="neutral.1" />
    {label}
  </Flex>
);

export const StartNode = () => (
  <>
    <Pill label="Start" icon="flag" tone="start" />
    <Handle type="source" position={Position.Right} />
  </>
);

export const FinishNode = () => (
  <>
    <Handle type="target" position={Position.Left} />
    <Pill label="Publish" icon="rocket_launch" tone="finish" />
  </>
);

export const StepNode = ({ data }: NodeProps) => {
  const { step, teams, onUpdate, onDelete } = data as unknown as StepNodeData;
  return (
    <Box
      bg="neutral.1"
      border="solid-25"
      borderColor="neutral.6"
      borderRadius={200}
      p={200}
      width={240}
      shadow="2"
    >
      <Handle type="target" position={Position.Left} />
      <Flex direction="column" gap={150}>
        <Flex align="center" gap={100}>
          <Box
            flex={1}
            fontSize="10px"
            fontWeight={700}
            color="neutral.9"
            textTransform="uppercase"
            letterSpacing="0.04em"
          >
            Review step
          </Box>
          <IconButton
            aria-label="Remove step"
            variant="ghost"
            size="xs"
            className="nodrag"
            onPress={() => onDelete(step.id)}
          >
            <Icon name="DeleteOutline" size={13} color="critical.11" />
          </IconButton>
        </Flex>
        <Box className="nodrag">
          <TextInput
            aria-label="Step title"
            value={step.title}
            onChange={(v: string) => onUpdate(step.id, { title: v })}
            placeholder="Step name"
          />
        </Box>
        <Box className="nodrag">
          <Select.Root
            aria-label="Assignee team"
            size="sm"
            selectedKey={step.assignee.teamId || null}
            onSelectionChange={(key) => {
              const team = teams.find((t) => t.id === key);
              onUpdate(step.id, {
                assignee: {
                  teamId: key ? String(key) : '',
                  teamName: team?.name ?? '',
                },
              });
            }}
          >
            <Select.Options>
              {teams.map((t) => (
                <Select.Option key={t.id} id={t.id}>
                  {t.name}
                </Select.Option>
              ))}
            </Select.Options>
          </Select.Root>
        </Box>
      </Flex>
      <Handle type="source" position={Position.Right} />
    </Box>
  );
};

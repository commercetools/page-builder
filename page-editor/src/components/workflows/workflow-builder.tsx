import { useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Button, Flex, Select, TextInput } from '@commercetools/nimbus';
import Icon from '../page-builder/shared/icon';
import { PAGE_TYPES } from '../page-builder/types';
import type { PageTypeId } from '../page-builder/types';
import type { OrgTeam } from '../../hooks/use-org-directory';
import type { WorkflowDefinition, WorkflowStep } from './types';
import { FinishNode, StartNode, StepNode } from './workflow-node';

const nodeTypes: NodeTypes = {
  start: StartNode,
  step: StepNode,
  finish: FinishNode,
};

const newStepId = () =>
  `step-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(
    36
  )}`;

type Props = {
  def: WorkflowDefinition;
  teams: OrgTeam[];
  saving?: boolean;
  onChange: (def: WorkflowDefinition) => void;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Visual workflow editor: a React Flow canvas rendering Start → steps → Finish
 * (Publish). Each step node edits its title + assignee team inline; the flow is
 * a linear chain, so node positions are auto-derived and not persisted.
 */
export const WorkflowBuilder = ({
  def,
  teams,
  saving,
  onChange,
  onSave,
  onCancel,
}: Props) => {
  const updateStep = (id: string, patch: Partial<WorkflowStep>) =>
    onChange({
      ...def,
      steps: def.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const deleteStep = (id: string) =>
    onChange({ ...def, steps: def.steps.filter((s) => s.id !== id) });
  const addStep = () =>
    onChange({
      ...def,
      steps: [
        ...def.steps,
        {
          id: newStepId(),
          title: `Step ${def.steps.length + 1}`,
          assignee: { teamId: '', teamName: '' },
        },
      ],
    });

  const nodes = useMemo<Node[]>(() => {
    const arr: Node[] = [
      {
        id: 'start',
        type: 'start',
        position: { x: 0, y: 60 },
        data: {},
        draggable: false,
      },
    ];
    def.steps.forEach((step, i) => {
      arr.push({
        id: step.id,
        type: 'step',
        position: { x: (i + 1) * 300, y: 0 },
        data: {
          step,
          teams,
          onUpdate: updateStep,
          onDelete: deleteStep,
        } as unknown as Record<string, unknown>,
        draggable: false,
      });
    });
    arr.push({
      id: 'finish',
      type: 'finish',
      position: { x: (def.steps.length + 1) * 300, y: 60 },
      data: {},
      draggable: false,
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.steps, teams]);

  const edges = useMemo<Edge[]>(() => {
    const ids = ['start', ...def.steps.map((s) => s.id), 'finish'];
    const arr: Edge[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      arr.push({
        id: `${ids[i]}->${ids[i + 1]}`,
        source: ids[i],
        target: ids[i + 1],
        animated: true,
      });
    }
    return arr;
  }, [def.steps]);

  return (
    <Flex direction="column" height="calc(100vh - 56px)" minHeight={0}>
      <Flex
        align="center"
        gap={200}
        p={300}
        borderBottom="solid-25"
        borderBottomColor="neutral.6"
        bg="neutral.1"
        flexShrink={0}
      >
        <Box width={260} flexShrink={0}>
          <TextInput
            aria-label="Workflow name"
            value={def.name}
            onChange={(v: string) => onChange({ ...def, name: v })}
            placeholder="Workflow name"
          />
        </Box>
        <Box flexShrink={0} minWidth={200}>
          <Select.Root
            aria-label="Page type"
            placeholder="Page type"
            size="sm"
            selectedKey={def.pageType}
            onSelectionChange={(key) =>
              onChange({ ...def, pageType: (key as PageTypeId) ?? 'all' })
            }
          >
            <Select.Options>
              {PAGE_TYPES.map((pt) => (
                <Select.Option key={pt.id} id={pt.id}>
                  {pt.label}
                </Select.Option>
              ))}
            </Select.Options>
          </Select.Root>
        </Box>
        <Button variant="outline" size="sm" onPress={addStep} flexShrink={0}>
          <Icon name="Add" size={14} color="neutral.11" />
          Add step
        </Button>
        <Box flex={1} />
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
        <Button
          variant="solid"
          colorPalette="primary"
          size="sm"
          onPress={onSave}
          isDisabled={saving || !def.name.trim()}
        >
          Save workflow
        </Button>
      </Flex>
      <Box flex={1} minHeight={0} bg="neutral.2">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </Box>
    </Flex>
  );
};

export default WorkflowBuilder;

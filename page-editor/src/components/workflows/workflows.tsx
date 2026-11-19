import { useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Box, Button, Flex, IconButton } from '@commercetools/nimbus';
import Icon from '../page-builder/shared/icon';
import { PAGE_TYPES } from '../page-builder/types';
import { useOrgDirectory } from '../../hooks/use-org-directory';
import {
  useWorkflowsFetcher,
  useWorkflowUpdater,
} from '../../hooks/use-workflows-connector';
import { WORKFLOW_SCHEMA_VERSION, type WorkflowDefinition } from './types';
import { WorkflowBuilder } from './workflow-builder';

const newWorkflowId = () =>
  `wf-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(
    36
  )}`;

const pageTypeLabel = (id: string) =>
  PAGE_TYPES.find((p) => p.id === id)?.label ?? id;

const Workflows = () => {
  const { workflows, loading } = useWorkflowsFetcher();
  const { saving, saveWorkflow, deleteWorkflow } = useWorkflowUpdater();
  const { teams, available } = useOrgDirectory();
  const userId = useApplicationContext((ctx) => ctx.user?.id) ?? '';
  const firstName = useApplicationContext((ctx) => ctx.user?.firstName);
  const lastName = useApplicationContext((ctx) => ctx.user?.lastName);
  const email = useApplicationContext((ctx) => ctx.user?.email);
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null);

  const authorName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    email ||
    'Unknown';

  const startNew = () => {
    const now = new Date().toISOString();
    setEditing({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: newWorkflowId(),
      name: '',
      pageType: 'all',
      steps: [],
      createdAt: now,
      updatedAt: now,
      createdBy: { id: userId, name: authorName },
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    await saveWorkflow({ ...editing, updatedAt: new Date().toISOString() });
    setEditing(null);
  };

  if (editing) {
    return (
      <WorkflowBuilder
        def={editing}
        teams={teams}
        saving={saving}
        onChange={setEditing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Box p={600} maxWidth={9600} margin="0 auto" width="100%">
      <Flex align="center" mb={500}>
        <Box>
          <Box as="h1" fontSize="24px" fontWeight={700} color="neutral.12">
            Workflows
          </Box>
          <Box fontSize="13px" color="neutral.10">
            Visual approval flows applied per page type.
          </Box>
        </Box>
        <Box flex={1} />
        <Button variant="solid" colorPalette="primary" onPress={startNew}>
          <Icon name="Add" size={16} color="neutral.1" />
          New workflow
        </Button>
      </Flex>

      {!available && (
        <Box
          mb={400}
          p={300}
          borderRadius={200}
          bg="warning.2"
          color="warning.11"
          fontSize="12.5px"
        >
          Team directory unavailable — you can still build workflows, but
          assignee teams can’t be listed here.
        </Box>
      )}

      {loading ? (
        <Box color="neutral.10">Loading…</Box>
      ) : workflows.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap={200}
          py={2000}
          border="1px dashed"
          borderColor="neutral.7"
          borderRadius={300}
          color="neutral.10"
        >
          <Icon name="AccountTree" size={28} color="neutral.9" />
          <Box fontSize="14px">No workflows yet.</Box>
          <Button variant="outline" size="sm" onPress={startNew}>
            Create your first workflow
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" gap={200}>
          {workflows.map((wf) => (
            <Flex
              key={wf.id}
              align="center"
              gap={300}
              p={300}
              border="solid-25"
              borderColor="neutral.6"
              borderRadius={200}
              bg="neutral.1"
            >
              <Flex
                align="center"
                justify="center"
                width={36}
                height={36}
                borderRadius={100}
                bg="primary.3"
                flexShrink={0}
              >
                <Icon name="AccountTree" size={18} color="primary.11" />
              </Flex>
              <Box flex={1} minWidth={0}>
                <Box fontSize="14px" fontWeight={600} color="neutral.12">
                  {wf.name || 'Untitled workflow'}
                </Box>
                <Box fontSize="12px" color="neutral.10">
                  {pageTypeLabel(wf.pageType)} · {wf.steps.length}{' '}
                  {wf.steps.length === 1 ? 'step' : 'steps'}
                </Box>
              </Box>
              <IconButton
                aria-label="Edit workflow"
                variant="ghost"
                size="xs"
                onPress={() => setEditing(wf)}
              >
                <Icon name="Edit" size={16} color="neutral.11" />
              </IconButton>
              <IconButton
                aria-label="Delete workflow"
                variant="ghost"
                size="xs"
                onPress={() => void deleteWorkflow(wf.id)}
              >
                <Icon name="DeleteOutline" size={16} color="critical.11" />
              </IconButton>
            </Flex>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default Workflows;

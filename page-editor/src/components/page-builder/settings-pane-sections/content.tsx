import { useIntl } from 'react-intl';
import { Accordion, Stack } from '@commercetools/nimbus';
import AccordionHeader from '../shared/accordion-header';
import messages from '../messages';
import { FormField } from '@commercetools/nimbus';
import type {
  ComponentElement,
  ComponentType,
  DataSourceType,
  SavedDataSource,
} from '../types';
import { SchemaFieldEditor } from '../shared/field-editor/schema-field-editor';
import { GroupFieldEditor } from '../shared/field-editor/group-field-editor';
import { DataSourceSlot } from './data-source-slot';

type Props = {
  selectedComp: ComponentElement;
  compDef: ComponentType;
  dataSourceCatalog: DataSourceType[];
  savedDataSources: SavedDataSource[];
  instancesDirty: boolean;
  openDsDialog: (
    type: string,
    currentId: string | null,
    applyId: (id: string | null) => void
  ) => void;
  handleCompChange: (updated: ComponentElement) => void;
};

/** The component's own schema fields. */
export const SettingsContentSection = ({
  selectedComp,
  compDef,
  dataSourceCatalog,
  savedDataSources,
  instancesDirty,
  openDsDialog,
  handleCompChange,
}: Props) => {
  const intl = useIntl();
  return (
    <Accordion.Item value="content">
      <AccordionHeader
        name={intl.formatMessage(messages.settingsPaneContentFields)}
      />
      <Accordion.Content paddingRight={800}>
        <Stack>
          {compDef.schema.map((field) => {
            const label =
              typeof field.label === 'string'
                ? field.label
                : Object.values(field.label)[0] ?? field.key;
            const handleChange = (v: unknown) =>
              handleCompChange({
                ...selectedComp,
                settings: { ...selectedComp.settings, [field.key]: v },
              });

            if (field.kind === 'dataSource') {
              const dsId = selectedComp.settings[field.key] as
                | string
                | null
                | undefined;
              return (
                <FormField.Root
                  key={field.key}
                  size={'sm'}
                  isRequired={field.required}
                  alignContent="start"
                >
                  <FormField.Label>{label}</FormField.Label>
                  <FormField.Input>
                    <DataSourceSlot
                      dsType={field.dataSourceType ?? ''}
                      dsId={dsId}
                      savedDataSources={savedDataSources}
                      dataSourceCatalog={dataSourceCatalog}
                      instancesDirty={instancesDirty}
                      onConfigure={() =>
                        openDsDialog(
                          field.dataSourceType ?? '',
                          dsId ?? null,
                          (id) => handleChange(id)
                        )
                      }
                      onClear={() => handleChange(null)}
                    />
                  </FormField.Input>
                  <FormField.Description>
                    {intl.formatMessage(
                      messages.settingsPaneDataSourceSlotDescription
                    )}
                  </FormField.Description>
                </FormField.Root>
              );
            }

            if (field.kind === 'group') {
              return (
                <GroupFieldEditor
                  key={`${selectedComp.id}:${field.key}`}
                  field={field}
                  value={selectedComp.settings[field.key]}
                  onChange={handleChange}
                />
              );
            }

            return (
              <SchemaFieldEditor
                key={field.key}
                field={field}
                value={selectedComp.settings[field.key]}
                onChange={handleChange}
              />
            );
          })}
        </Stack>
      </Accordion.Content>
    </Accordion.Item>
  );
};

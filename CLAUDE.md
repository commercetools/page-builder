# Claude Code Configuration

Read `AGENTS.md` for full project context. This package is part of the monorepo
— see the root `AGENTS.md` for monorepo-wide commands and conventions.

## Rules
- Never run `git commit` or `git push` without explicit user instruction.
- Before implementing any UI component, always check the Nimbus MCP (`nimbus`) for the correct component API, props, and variants.
- Before writing any commercetools GraphQL query or mutation, always check the CT developer MCP (`commercetools-developer`) for the correct schema, type names, and API best practices.

## React UI
When writing React UI code:
- Use the Nimbus MCP server to look up component APIs before using any component.
- Never use plain HTML elements; always find an equivalent Nimbus component. When in doubt, fall back to `Box`.
- Always use style-props (via the `css` prop or Nimbus/Chakra system props); do not write plain CSS.
- Always try to use a design-system token; use custom values only when no fitting token exists.
- Use direct JSX style props instead of the `css` prop for every CSS property that Chakra supports as a prop. Move ALL properties out of `css={{}}` as direct props (e.g. `background="white"`, `cursor="grab"`, `flex={1}`, `overflow="hidden"`). Only keep `css={{}}` for pseudo-selectors (`_hover`, `_focus`, etc.) or when there is no other option. Remove the `css` prop entirely when it becomes empty.
- Use Nimbus/Chakra palette token strings for all color and semantic values — never pass raw `tokens.*` values. Examples: `color="neutral.9"` not `color={tokens.fgMuted}`, `bg="neutral.3"` not `background={tokens.bgSubtle}`. Key mappings: `tokens.fgPrimary`→`"neutral.12"`, `tokens.fgSecondary`→`"neutral.11"`, `tokens.fgMuted`→`"neutral.9"`, `tokens.bgSubtle`→`"neutral.3"`, `tokens.borderDefault`→`"neutral.6"`, `tokens.primary700`→`"primary.11"`, etc. `"white"` is not a valid palette token — use `"neutral.1"` (hsl 99% lightness) instead.
- When referencing palette colors as raw CSS variables (e.g. in `boxShadow` strings), use the `--nimbus-colors-` prefix: `var(--nimbus-colors-primary-9)`, not `var(--colors-primary-9)`.
- Use `bg=` (not `background=` or `backgroundColor=`) for the background prop on all Nimbus components.
- For spacing/radius use the token scale number: `gap={200}`, `mb={300}`, `borderRadius={150}`. Two-value padding: `py={V} px={H}`.
- For the `shadow` prop use a string value, not a number: `shadow={'3'}` not `shadow={3}`.
- For borders use Nimbus border tokens (`"solid-25"`=1px, `"solid-50"`=2px, `"solid-75"`=3px) instead of raw pixel values. This applies to `border`, `borderBottom`, `borderTop`, `borderLeft`, and `borderRight`. Example: `border="solid-25" borderColor="neutral.6"`, `borderBottom="solid-25" borderBottomColor="neutral.6"`. Never use template literals like `` border={`${tokens.border25} ${tokens.borderDefault}`} ``. Exception: dashed borders (`border="1px dashed"`) have no Nimbus token equivalent and must use raw pixel values.
- On `Flex` use the shorthands: `align` (not `alignItems`), `justify` (not `justifyContent`), `direction` (not `flexDirection`). On `Box` use full CSS property names.
- Accessibility: every input component (`TextInput`, `SearchInput`, etc.) must have a visible label via `FormField.Label`, or `aria-label` when no visible label is present. `LocalizedField` uses a `label` prop (not `aria-label`) for its accessible name.

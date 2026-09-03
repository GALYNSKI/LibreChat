/**
 * One place answers "may this chat offer file search / the code environment?".
 * Two conditions must both hold: the selection (a saved agent's tools, or the spec's
 * ephemeral toggles) allows it, and the user's role permits it.
 */
import { renderHook } from '@testing-library/react';
import { EToolResources, PermissionTypes } from 'librechat-data-provider';

let mockAgentsMap: Record<string, { tools?: string[]; provider?: string }> = {};
let mockRolePermissions: Record<string, boolean> = {};

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => mockAgentsMap,
}));

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: () => ({ data: undefined }),
}));

jest.mock('~/hooks/Roles', () => ({
  useHasAccess: ({ permissionType }: { permissionType: PermissionTypes }) =>
    mockRolePermissions[permissionType] ?? true,
}));

import useUploadDestinationGates from '../useUploadDestinationGates';

const gatesFor = (agentId?: string | null, ephemeralAgent?: Record<string, boolean> | null) =>
  renderHook(() => useUploadDestinationGates({ agentId, ephemeralAgent })).result.current;

beforeEach(() => {
  mockAgentsMap = {};
  mockRolePermissions = {};
});

describe('useUploadDestinationGates', () => {
  test('refuses both when a spec enables neither', () => {
    const gates = gatesFor(undefined, {});

    expect(gates.fileSearchAllowed).toBe(false);
    expect(gates.codeAllowed).toBe(false);
  });

  test('allows what the spec enables', () => {
    const gates = gatesFor(undefined, { [EToolResources.file_search]: true });

    expect(gates.fileSearchAllowed).toBe(true);
    expect(gates.codeAllowed).toBe(false);
  });

  test("allows what a saved agent's tools include", () => {
    mockAgentsMap = { agent_abc: { tools: ['execute_code'], provider: 'openAI' } };
    const gates = gatesFor('agent_abc', {});

    expect(gates.codeAllowed).toBe(true);
    expect(gates.fileSearchAllowed).toBe(false);
    expect(gates.provider).toBe('openAI');
  });

  test('refuses when the agent id is unknown — fails closed', () => {
    const gates = gatesFor('agent_missing', {});

    expect(gates.fileSearchAllowed).toBe(false);
    expect(gates.codeAllowed).toBe(false);
  });

  test('the role can veto what the spec allows', () => {
    mockRolePermissions = { [PermissionTypes.FILE_SEARCH]: false };
    const gates = gatesFor(undefined, { [EToolResources.file_search]: true });

    expect(gates.fileSearchAllowed).toBe(false);
  });

  test("the role can veto a saved agent's tool", () => {
    mockAgentsMap = { agent_abc: { tools: ['execute_code'] } };
    mockRolePermissions = { [PermissionTypes.RUN_CODE]: false };

    expect(gatesFor('agent_abc', {}).codeAllowed).toBe(false);
  });

  test('the role alone does not grant what the spec withholds', () => {
    mockRolePermissions = {
      [PermissionTypes.FILE_SEARCH]: true,
      [PermissionTypes.RUN_CODE]: true,
    };
    const gates = gatesFor(undefined, {});

    expect(gates.fileSearchAllowed).toBe(false);
    expect(gates.codeAllowed).toBe(false);
  });
});

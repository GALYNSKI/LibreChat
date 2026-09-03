/**
 * `getOptions` decides which upload destinations a file may go to. Two inputs were
 * missing from that decision:
 *
 * 1. **The spec's capabilities.** `useUploadOptions` fetched
 *    `useAgentToolPermissions(...)` — which resolves the ephemeral/spec case — and
 *    then threw the result away, recomputing `!isSavedAgent || tools?.includes(...)`.
 *    That is `true` for every chat that is not a saved agent, so a model spec with
 *    neither tool enabled still offered both destinations.
 * 2. **The user's role permissions.** They were not consulted at all, so a role with
 *    `FILE_SEARCH.USE: false` was still offered file search — and found out only when
 *    the server rejected the upload.
 */
import { renderHook } from '@testing-library/react';
import { EToolResources, PermissionTypes } from 'librechat-data-provider';

const mockDragDropContext = {
  conversationId: 'convo-1',
  agentId: undefined as string | undefined,
  endpoint: 'agents',
  endpointType: undefined,
  useResponsesApi: false,
};
let mockEphemeralAgent: Record<string, boolean> = {};
let mockAgentsMap: Record<string, { tools?: string[]; provider?: string }> = {};
let mockRolePermissions: Record<string, boolean> = {};

jest.mock('~/Providers', () => ({
  useDragDropContext: () => mockDragDropContext,
  useAgentsMapContext: () => mockAgentsMap,
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => mockEphemeralAgent,
}));

jest.mock('~/store', () => ({
  ephemeralAgentByConvoId: () => ({}),
}));

jest.mock('~/hooks/Agents/useGetAgentsConfig', () => ({
  __esModule: true,
  default: () => ({ agentsConfig: { capabilities: ['file_search', 'execute_code', 'context'] } }),
}));

jest.mock('~/hooks/Agents/useAgentCapabilities', () => ({
  __esModule: true,
  default: () => ({ fileSearchEnabled: true, codeEnabled: true, contextEnabled: true }),
}));

jest.mock('~/data-provider', () => ({
  /** The real default config, so MIME checks behave as they do in the app. */
  useGetFileConfig: () => ({
    data: jest.requireActual('librechat-data-provider').mergeFileConfig(undefined),
    isError: false,
    isPaused: false,
    isSuccess: true,
  }),
  useGetAgentByIdQuery: () => ({ data: undefined }),
}));

jest.mock('~/hooks/Roles', () => ({
  useHasAccess: ({ permissionType }: { permissionType: PermissionTypes }) =>
    mockRolePermissions[permissionType] ?? true,
}));

import useUploadOptions from '../useUploadOptions';

/** A .txt is viable for every destination, so only the gates under test decide. */
const textFile = (): File => new File(['hello world'], 'notes.txt', { type: 'text/plain' });

const optionsFor = (): (EToolResources | undefined)[] => {
  const { result } = renderHook(() => useUploadOptions());
  return result.current.getOptions([textFile()]);
};

beforeEach(() => {
  mockDragDropContext.agentId = undefined;
  mockEphemeralAgent = {};
  mockAgentsMap = {};
  mockRolePermissions = {};
});

describe('useUploadOptions — the spec decides', () => {
  test('offers neither tool when the spec enables neither', () => {
    const options = optionsFor();

    /** The bug: both used to be offered here, because the chat is not a saved agent. */
    expect(options).not.toContain(EToolResources.file_search);
    expect(options).not.toContain(EToolResources.execute_code);
  });

  test('offers file search when the spec enables it', () => {
    mockEphemeralAgent = { [EToolResources.file_search]: true };

    expect(optionsFor()).toContain(EToolResources.file_search);
  });

  test('offers code when the spec enables it, and still not file search', () => {
    mockEphemeralAgent = { [EToolResources.execute_code]: true };
    const options = optionsFor();

    expect(options).toContain(EToolResources.execute_code);
    expect(options).not.toContain(EToolResources.file_search);
  });

  test("follows a saved agent's tools", () => {
    mockDragDropContext.agentId = 'agent_abc';
    mockAgentsMap = { agent_abc: { tools: ['file_search'] } };
    const options = optionsFor();

    expect(options).toContain(EToolResources.file_search);
    expect(options).not.toContain(EToolResources.execute_code);
  });
});

describe('useUploadOptions — the role decides too', () => {
  test('withholds file search when the role forbids it, even if the spec allows it', () => {
    mockEphemeralAgent = { [EToolResources.file_search]: true };
    mockRolePermissions = { [PermissionTypes.FILE_SEARCH]: false };

    expect(optionsFor()).not.toContain(EToolResources.file_search);
  });

  test('withholds code when the role forbids it, even if the spec allows it', () => {
    mockEphemeralAgent = { [EToolResources.execute_code]: true };
    mockRolePermissions = { [PermissionTypes.RUN_CODE]: false };

    expect(optionsFor()).not.toContain(EToolResources.execute_code);
  });

  test('withholds a saved agent tool when the role forbids it', () => {
    mockDragDropContext.agentId = 'agent_abc';
    mockAgentsMap = { agent_abc: { tools: ['file_search'] } };
    mockRolePermissions = { [PermissionTypes.FILE_SEARCH]: false };

    expect(optionsFor()).not.toContain(EToolResources.file_search);
  });

  test('leaves the remaining destinations untouched', () => {
    mockRolePermissions = {
      [PermissionTypes.FILE_SEARCH]: false,
      [PermissionTypes.RUN_CODE]: false,
    };
    const options = optionsFor();

    /** Nothing here gates "as text" or the provider path — those are Teil 3. */
    expect(options).toContain(EToolResources.context);
    expect(options.length).toBeGreaterThan(0);
  });
});

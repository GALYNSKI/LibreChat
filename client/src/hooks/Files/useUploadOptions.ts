import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import {
  Constants,
  Permissions,
  mergeFileConfig,
  PermissionTypes,
  getEndpointFileConfig,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { EToolResources } from 'librechat-data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import useGetAgentsConfig from '~/hooks/Agents/useGetAgentsConfig';
import { useGetFileConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { getViableUploadOptions } from '~/utils';
import { useDragDropContext } from '~/Providers';
import { useHasAccess } from '~/hooks/Roles';

/**
 * Resolves which upload destinations a file set can be routed to, plus whether uploads are
 * disabled for the endpoint. Shared by the paste, drag, and modal flows so they decide
 * consistently from one source.
 */
export default function useUploadOptions() {
  const { conversationId, agentId, endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const { agentsConfig } = useGetAgentsConfig();
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const ephemeralAgent = useRecoilValue(
    ephemeralAgentByConvoId(conversationId ?? Constants.NEW_CONVO),
  );
  const {
    provider,
    fileSearchAllowedByAgent: fileSearchAllowedBySelection,
    codeAllowedByAgent: codeAllowedBySelection,
  } = useAgentToolPermissions(agentId, ephemeralAgent);

  /**
   * Role permissions, not just capabilities. A role with `FILE_SEARCH.USE: false`
   * must not be offered the destination at all — otherwise the upload is attempted
   * and rejected by the server, and the user is told "no" only after choosing.
   */
  const fileSearchAllowedByRole = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const codeAllowedByRole = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const {
    data: fileConfig = null,
    isError: isFileConfigError,
    isPaused: isFileConfigPaused,
    isSuccess: isFileConfigLoaded,
  } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  /** Destination checks read this config, so callers can tell "not viable" from "not known yet". */
  const isConfigPending = !isFileConfigLoaded && !isFileConfigError && !isFileConfigPaused;

  /**
   * A destination is offerable only when the selection (saved agent's tools, or the
   * spec's ephemeral toggles) allows it *and* the user's role permits it.
   *
   * This used to be recomputed here as `!isSavedAgent || tools?.includes(...)`, which
   * is `true` for every chat that is not a saved agent — so a model spec that enables
   * neither tool still offered both. `useAgentToolPermissions` already resolves the
   * ephemeral/spec case correctly; its result was fetched and then thrown away.
   */
  const fileSearchAllowedByAgent = fileSearchAllowedBySelection && fileSearchAllowedByRole;
  const codeAllowedByAgent = codeAllowedBySelection && codeAllowedByRole;

  const endpointFileConfig = getEndpointFileConfig({ fileConfig, endpoint, endpointType });
  const uploadsDisabled = endpointFileConfig.disabled === true;
  const endpointSupportedMimeTypes = endpointFileConfig.supportedMimeTypes;

  const getOptions = useCallback(
    (files: File[]): (EToolResources | undefined)[] =>
      getViableUploadOptions(files, {
        provider,
        endpoint,
        endpointType,
        useResponsesApi,
        fileSearchEnabled: capabilities.fileSearchEnabled,
        codeEnabled: capabilities.codeEnabled,
        contextEnabled: capabilities.contextEnabled,
        fileSearchAllowedByAgent,
        codeAllowedByAgent,
        fileConfig,
        endpointSupportedMimeTypes,
      }),
    [
      provider,
      endpoint,
      endpointType,
      useResponsesApi,
      capabilities.fileSearchEnabled,
      capabilities.codeEnabled,
      capabilities.contextEnabled,
      fileSearchAllowedByAgent,
      codeAllowedByAgent,
      fileConfig,
      endpointSupportedMimeTypes,
    ],
  );

  return { getOptions, uploadsDisabled, isConfigPending };
}

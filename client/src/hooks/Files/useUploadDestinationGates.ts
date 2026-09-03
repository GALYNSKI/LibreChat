import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { TEphemeralAgent } from 'librechat-data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { useHasAccess } from '~/hooks/Roles';

interface UploadDestinationGates {
  provider?: string;
  /** File search may be offered: the selection allows it and the role permits it. */
  fileSearchAllowed: boolean;
  /** The code environment may be offered, under the same two conditions. */
  codeAllowed: boolean;
}

/**
 * The single answer to "may this chat offer file search / the code environment?".
 *
 * Two callers need it and used to answer it differently: `useUploadOptions` (drag,
 * paste, modal) recomputed it from `agentId` and got `true` for every non-saved-agent
 * chat, while `AttachFileMenu` asked `useAgentToolPermissions` directly. Neither
 * consulted the user's role. Both now come here.
 *
 * Inputs are explicit rather than read from `DragDropContext`: the attachment menu
 * receives them as props, and that context falls back to all-`undefined` outside its
 * provider — which would silently gate on the wrong conversation.
 */
export default function useUploadDestinationGates({
  agentId,
  ephemeralAgent,
}: {
  agentId?: string | null;
  ephemeralAgent?: TEphemeralAgent | null;
}): UploadDestinationGates {
  const { provider, fileSearchAllowedByAgent, codeAllowedByAgent } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  /**
   * A role with `FILE_SEARCH.USE: false` must not see the destination at all —
   * otherwise the upload is attempted and the server rejects it, so the user learns
   * "no" only after choosing.
   */
  const fileSearchAllowedByRole = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const codeAllowedByRole = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });

  return {
    provider,
    fileSearchAllowed: fileSearchAllowedByAgent && fileSearchAllowedByRole,
    codeAllowed: codeAllowedByAgent && codeAllowedByRole,
  };
}

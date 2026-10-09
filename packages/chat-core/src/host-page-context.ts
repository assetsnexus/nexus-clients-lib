/**
 * Structured context the host app sets on a chat turn.
 *
 * Optional. `projectId` is one field an app may set; it is not required.
 * A later context brain can write these same fields. An empty project id
 * is treated as no page context.
 */
export type HostPageContext = {
  projectId?: string;
  projectName?: string;
};

export function normalizeHostPageContext(
  value: HostPageContext | null | undefined,
): HostPageContext | undefined {
  if (!value) return undefined;
  const projectId = typeof value.projectId === 'string' ? value.projectId.trim() : '';
  const projectName = typeof value.projectName === 'string' ? value.projectName.trim() : '';
  if (!projectId) return undefined;
  return projectName ? { projectId, projectName } : { projectId };
}

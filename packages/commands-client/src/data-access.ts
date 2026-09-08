export type DataAccessApprovalPrompt = {
  grantId: string | null;
  access: string;
  resource: { kind: string; id: string; name: string | null };
  granteeKind: string | null;
  parents: Array<{ kind: string; id: string; name: string | null }>;
  scopeChoices: Array<{
    kind: string;
    id: string;
    name: string;
    label: string;
    isLeaf: boolean;
  }>;
  message: string;
  decisions: Array<'once' | 'always' | 'never'>;
};

export function mapDataAccessApprovalError(
  errorObject: { code?: string; message?: string; details?: Record<string, any> } | null | undefined,
): DataAccessApprovalPrompt | null {
  if (!errorObject || errorObject.code !== 'DATA_ACCESS_APPROVAL_REQUIRED') {
    return null;
  }

  const details = errorObject.details || {};
  const resource = details.resource || {};
  const parents = Array.isArray(details.parents) ? details.parents : [];

  const scopeChoices = [
    {
      kind: resource.kind || 'unknown',
      id: resource.id || '',
      name: resource.name || resource.id || 'Requested resource',
      label: resource.name || resource.id || 'This resource',
      isLeaf: true,
    },
    ...parents.map((parent: any) => ({
      kind: parent.kind || 'unknown',
      id: parent.id || '',
      name: parent.name || parent.id || parent.kind,
      label: parent.name || `${parent.kind} ${parent.id}`,
      isLeaf: false,
    })),
  ].filter((row) => row.id);

  return {
    grantId: details.grantId || null,
    access: details.access || resource.access || 'read',
    resource: {
      kind: resource.kind || 'unknown',
      id: resource.id || '',
      name: resource.name || null,
    },
    granteeKind: details.granteeKind || null,
    parents: parents.map((p: any) => ({
      kind: p.kind,
      id: p.id,
      name: p.name || null,
    })),
    scopeChoices,
    message: errorObject.message || 'Data access requires your approval.',
    decisions: ['once', 'always', 'never'],
  };
}

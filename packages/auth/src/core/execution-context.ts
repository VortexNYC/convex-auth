export type ExecutionContext = {
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  audience: string | null;
  scopes: string[];
};

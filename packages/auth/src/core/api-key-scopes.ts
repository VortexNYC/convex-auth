import { hasPermission } from "./permissions";

export type ApiKeyScopeDescriptor<Scope extends string = string> = {
  scope: Scope;
  label?: string;
  description?: string;
  requiredPermissions?: readonly string[];
  defaultSelected?: boolean;
};

export type ApiKeyScopeFromDescriptors<Descriptors extends readonly ApiKeyScopeDescriptor[]> =
  Descriptors[number]["scope"];

export type ApiKeyScopeRegistry<Scope extends string = string> = {
  descriptors: readonly ApiKeyScopeDescriptor<Scope>[];
  scopes: readonly Scope[];
  defaultScopes: readonly Scope[];
  getDescriptor(scope: string): ApiKeyScopeDescriptor<Scope> | null;
  isKnownScope(scope: string): scope is Scope;
  normalizeScopes(scopes: readonly string[]): Scope[];
  requireKnownScopes(scopes: readonly string[]): Scope[];
  canUseScope(scope: Scope, permissions: readonly string[]): boolean;
  filterUsableScopes(scopes: readonly Scope[], permissions: readonly string[]): Scope[];
};

export function createApiKeyScopeRegistry<
  const Descriptors extends readonly ApiKeyScopeDescriptor[],
>(descriptors: Descriptors): ApiKeyScopeRegistry<ApiKeyScopeFromDescriptors<Descriptors>> {
  type Scope = ApiKeyScopeFromDescriptors<Descriptors>;

  const descriptorMap = new Map<Scope, ApiKeyScopeDescriptor<Scope>>();
  const normalizedDescriptors = descriptors.map((descriptor) => {
    const scope = normalizeScopeValue(descriptor.scope) as Scope;

    if (scope.length === 0) {
      throw new Error("API key scope cannot be empty.");
    }

    if (descriptorMap.has(scope)) {
      throw new Error(`Duplicate API key scope: ${scope}`);
    }

    const normalizedDescriptor: ApiKeyScopeDescriptor<Scope> = { scope };

    if (descriptor.label !== undefined) {
      normalizedDescriptor.label = descriptor.label;
    }

    if (descriptor.description !== undefined) {
      normalizedDescriptor.description = descriptor.description;
    }

    if (descriptor.requiredPermissions !== undefined) {
      normalizedDescriptor.requiredPermissions = descriptor.requiredPermissions;
    }

    if (descriptor.defaultSelected !== undefined) {
      normalizedDescriptor.defaultSelected = descriptor.defaultSelected;
    }

    descriptorMap.set(scope, normalizedDescriptor);
    return normalizedDescriptor;
  });

  const scopeSet = new Set<Scope>(normalizedDescriptors.map((descriptor) => descriptor.scope));
  const scopes = normalizedDescriptors.map((descriptor) => descriptor.scope);
  const defaultScopes = normalizedDescriptors
    .filter((descriptor) => descriptor.defaultSelected === true)
    .map((descriptor) => descriptor.scope);

  function isKnownScope(scope: string): scope is Scope {
    return scopeSet.has(scope);
  }

  function normalizeScopes(inputScopes: readonly string[]): Scope[] {
    return collectScopes(inputScopes, isKnownScope, false);
  }

  function requireKnownScopes(inputScopes: readonly string[]): Scope[] {
    return collectScopes(inputScopes, isKnownScope, true);
  }

  function canUseScope(scope: Scope, permissions: readonly string[]): boolean {
    const descriptor = descriptorMap.get(scope);
    const requiredPermissions = descriptor?.requiredPermissions ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    return requiredPermissions.some((permission) => hasPermission(permissions, permission));
  }

  return {
    descriptors: normalizedDescriptors,
    scopes,
    defaultScopes,
    getDescriptor(scope) {
      return descriptorMap.get(normalizeScopeValue(scope)) ?? null;
    },
    isKnownScope,
    normalizeScopes,
    requireKnownScopes,
    canUseScope,
    filterUsableScopes(inputScopes, permissions) {
      return inputScopes.filter((scope) => canUseScope(scope, permissions));
    },
  };
}

function collectScopes<Scope extends string>(
  inputScopes: readonly string[],
  isKnownScope: (scope: string) => scope is Scope,
  throwOnUnknown: boolean,
): Scope[] {
  const scopes: Scope[] = [];
  const seenScopes = new Set<Scope>();

  for (const rawScope of inputScopes) {
    const scope = normalizeScopeValue(rawScope);

    if (scope.length === 0) {
      if (throwOnUnknown) {
        throw new Error("API key scope cannot be empty.");
      }

      continue;
    }

    if (!isKnownScope(scope)) {
      if (throwOnUnknown) {
        throw new Error(`Unknown API key scope: ${scope}`);
      }

      continue;
    }

    if (!seenScopes.has(scope)) {
      seenScopes.add(scope);
      scopes.push(scope);
    }
  }

  return scopes;
}

function normalizeScopeValue(scope: string): string {
  return scope.trim();
}

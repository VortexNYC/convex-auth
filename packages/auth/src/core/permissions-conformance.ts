export type PermissionMatcherConformanceCase = {
  name: string;
  granted: readonly string[];
  required: string;
  expected: boolean;
};

const malformedRequiredPermissionCharacters: readonly {
  label: string;
  codePoint: number;
}[] = [
  { label: "U+200B zero-width space", codePoint: 0x200b },
  { label: "U+200C zero-width non-joiner", codePoint: 0x200c },
  { label: "U+200D zero-width joiner", codePoint: 0x200d },
  { label: "U+200E left-to-right mark", codePoint: 0x200e },
  { label: "U+202E right-to-left override", codePoint: 0x202e },
  { label: "U+0000 null", codePoint: 0x0000 },
  { label: "U+0007 bell", codePoint: 0x0007 },
];

/** Shared adversarial contract for the convex-auth permission matcher. */
export const permissionMatcherConformanceCases: readonly PermissionMatcherConformanceCase[] = [
  {
    name: "super wildcard",
    granted: ["*"],
    required: "billing:read",
    expected: true,
  },
  {
    name: "super wildcard grants bare exact",
    granted: ["*"],
    required: "billing",
    expected: true,
  },
  {
    name: "domain wildcard",
    granted: ["billing:*"],
    required: "billing:read",
    expected: true,
  },
  {
    name: "domain wildcard matches nested action",
    granted: ["billing:*"],
    required: "billing:invoice:read",
    expected: true,
  },
  {
    name: "domain wildcard stays in domain",
    granted: ["billing:*"],
    required: "people:read",
    expected: false,
  },
  {
    name: "exact grant",
    granted: ["billing:read"],
    required: "billing:read",
    expected: true,
  },
  {
    name: "exact grant does not widen",
    granted: ["billing:read"],
    required: "billing:write",
    expected: false,
  },
  {
    name: "dot separator remains valid",
    granted: ["billing.read"],
    required: "billing.read",
    expected: true,
  },
  {
    name: "underscore separator remains valid",
    granted: ["api_v2:read"],
    required: "api_v2:read",
    expected: true,
  },
  {
    name: "hyphen separator remains valid in wildcard domain",
    granted: ["read-only:*"],
    required: "read-only:x",
    expected: true,
  },
  {
    name: "bare domain bug stays fixed",
    granted: ["billing:*"],
    required: "billing",
    expected: false,
  },
  {
    name: "bare exact remains valid",
    granted: ["billing"],
    required: "billing",
    expected: true,
  },
  {
    name: "empty required denies",
    granted: ["*"],
    required: "",
    expected: false,
  },
  {
    name: "empty grant denies",
    granted: [""],
    required: "billing:read",
    expected: false,
  },
  {
    name: "whitespace required denies",
    granted: ["*"],
    required: "billing: read",
    expected: false,
  },
  {
    name: "whitespace grant denies",
    granted: ["billing: read"],
    required: "billing: read",
    expected: false,
  },
  {
    name: "leading colon denies",
    granted: ["*"],
    required: ":read",
    expected: false,
  },
  {
    name: "trailing colon denies",
    granted: ["*"],
    required: "billing:",
    expected: false,
  },
  {
    name: "wildcard cannot be required",
    granted: ["*"],
    required: "billing:*",
    expected: false,
  },
  {
    name: "malformed wildcard grant denies",
    granted: ["billing:**"],
    required: "billing:read",
    expected: false,
  },
  {
    name: "case sensitive",
    granted: ["Billing:*"],
    required: "billing:read",
    expected: false,
  },
  ...malformedRequiredPermissionCharacters.flatMap(({ label, codePoint }) => {
    const required = `billing:${String.fromCharCode(codePoint)}read`;
    return [
      {
        name: `${label} required denies domain wildcard`,
        granted: ["billing:*"],
        required,
        expected: false,
      },
      {
        name: `${label} required denies super wildcard`,
        granted: ["*"],
        required,
        expected: false,
      },
    ];
  }),
];

export type PermissionIntersectionConformanceCase = {
  name: string;
  owner: readonly string[];
  narrowed: readonly string[];
  expected: readonly string[];
};

export const permissionIntersectionConformanceCases: readonly PermissionIntersectionConformanceCase[] =
  [
    {
      name: "owner super wildcard keeps key ceiling",
      owner: ["*"],
      narrowed: ["billing:read"],
      expected: ["billing:read"],
    },
    {
      name: "owner domain wildcard keeps exact key ceiling",
      owner: ["billing:*"],
      narrowed: ["billing:read"],
      expected: ["billing:read"],
    },
    {
      name: "exact owner narrows broad key grant",
      owner: ["billing:read"],
      narrowed: ["billing:*"],
      expected: ["billing:read"],
    },
    {
      name: "matching domain wildcards survive",
      owner: ["billing:*"],
      narrowed: ["billing:*"],
      expected: ["billing:*"],
    },
    {
      name: "different domains deny",
      owner: ["billing:*"],
      narrowed: ["people:*"],
      expected: [],
    },
    {
      name: "malformed grants deny",
      owner: ["*"],
      narrowed: ["billing:**", ""],
      expected: [],
    },
  ];

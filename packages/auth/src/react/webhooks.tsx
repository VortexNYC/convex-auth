import { cn } from "./lib/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useRef, useState, type ReactNode } from "react";

import { useGuardedConvexMutation } from "./protected-writes";

export type ConvexWebhookEndpointStatus = "active" | "disabled" | "archived";

export type ConvexWebhookDeliveryStatus = "pending" | "processing" | "delivered" | "failed";

export type ConvexWebhookDeliveryFailureKind =
  | "endpoint_inactive"
  | "network_error"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "unknown_error";

export type ConvexWebhookEndpointListItem<
  EventType extends string = string,
  EndpointId extends string = string,
> = {
  _id: EndpointId;
  url: string;
  description?: string;
  status: ConvexWebhookEndpointStatus;
  events: readonly EventType[];
  secretPreview: string;
  createdAt: number;
  updatedAt: number;
};

export type ConvexWebhookDeliveryListItem<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  _id: DeliveryId;
  endpointId: EndpointId;
  organizationId: OrganizationId;
  eventId: string;
  eventType: EventType;
  payload: string;
  status: ConvexWebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: number;
  lastAttemptAt?: number;
  deliveredAt?: number;
  exhaustedAt?: number;
  recoveredAt?: number;
  recoveryCount?: number;
  responseStatus?: number;
  responseBody?: string;
  failureKind?: ConvexWebhookDeliveryFailureKind;
  createdAt: number;
  updatedAt: number;
  endpointUrl?: string;
  endpointDescription?: string;
};

export type ConvexWebhookDeliveryPage<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  items: readonly ConvexWebhookDeliveryListItem<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type ConvexWebhookCreateFormState<EventType extends string = string> = {
  url: string;
  description: string;
  events: readonly EventType[];
};

export type ConvexWebhookCreateFormCopy = {
  urlLabel?: string;
  urlPlaceholder?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  createLabel?: string;
  creatingLabel?: string;
};

export type ConvexWebhookEndpointListCopy = {
  loadingMessage?: string;
  emptyMessage: string;
  allEventsLabel?: string;
  endpointUrlLabel?: string;
  descriptionLabel?: string;
  secretLabel?: string;
  sendTestLabel?: string;
  sendingTestLabel?: string;
  rotateSecretLabel?: string;
  disableLabel?: string;
  archiveLabel?: string;
  deleteLabel?: string;
  saveLabel?: string;
};

export type ConvexWebhookDeliveryCopy = {
  loadingMessage?: string;
  emptyMessage: string;
  historyTitle?: string;
  historyDescription?: string;
  exhaustedLoadingMessage?: string;
  exhaustedTitle?: string;
  exhaustedDescription?: string;
  endpointFilterLabel?: string;
  statusFilterLabel?: string;
  eventFilterLabel?: string;
  allEndpointsLabel?: string;
  allStatusesLabel?: string;
  allEventTypesLabel?: string;
  eventIdLabel?: string;
  createdLabel?: string;
  retryDueLabel?: string;
  recoveredLabel?: string;
  exhaustedLabel?: string;
  responseLabel?: string;
  failureKindLabel?: string;
  retryLabel?: string;
  retryingLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  showingLabel?: string;
  ofLabel?: string;
};

export type ConvexWebhookClassNames = {
  card?: string;
  cardContent?: string;
  label?: string;
  labelText?: string;
  input?: string;
  select?: string;
  primaryButton?: string;
  primaryButtonDisabled?: string;
  secondaryButton?: string;
  warningButton?: string;
  destructiveButton?: string;
  endpointList?: string;
  endpointCard?: string;
  endpointHeader?: string;
  endpointMeta?: string;
  endpointActions?: string;
  endpointFormGrid?: string;
  pillList?: string;
  pill?: string;
  pillSelected?: string;
  pillDisabled?: string;
  tag?: string;
  deliveryFilterGrid?: string;
  deliveryPanel?: string;
  deliveryCard?: string;
  deliveryHeader?: string;
  deliveryDetails?: string;
  exhaustedPanel?: string;
  stateText?: string;
  codeBlock?: string;
};

export type ConvexWebhookCreateFormProps<EventType extends string = string> = {
  classNames?: ConvexWebhookClassNames;
  copy?: ConvexWebhookCreateFormCopy;
  creating: boolean;
  enabled: boolean;
  eventOptions: readonly EventType[];
  onDescriptionChange: (value: string) => void;
  onEventsChange: (value: EventType[]) => void;
  onSubmit: () => void;
  onUrlChange: (value: string) => void;
  state: ConvexWebhookCreateFormState<EventType>;
};

export type ConvexWebhookEndpointListProps<
  EventType extends string = string,
  EndpointId extends string = string,
> = {
  classNames?: ConvexWebhookClassNames;
  copy: ConvexWebhookEndpointListCopy;
  endpoints: readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] | undefined;
  eventOptions: readonly EventType[];
  onArchive: (endpointId: EndpointId) => void;
  onDelete: (endpointId: EndpointId) => void;
  onDisable: (endpointId: EndpointId) => void;
  onRotateSecret: (endpointId: EndpointId) => void;
  onSave: (
    endpointId: EndpointId,
    values: { url: string; description?: string; events: EventType[] },
  ) => void;
  onSendTest: (endpointId: EndpointId) => void;
  renderTag?: (label: string) => ReactNode;
  sendingTestEndpointId: EndpointId | null;
};

export type ConvexWebhookDeliveryFiltersProps<
  EventType extends string = string,
  EndpointId extends string = string,
> = {
  classNames?: ConvexWebhookClassNames;
  copy?: Partial<ConvexWebhookDeliveryCopy>;
  endpointId: EndpointId | "all";
  endpoints: readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] | undefined;
  eventOptions: readonly EventType[];
  eventType: EventType | "all";
  onEndpointIdChange: (value: EndpointId | "all") => void;
  onEventTypeChange: (value: EventType | "all") => void;
  onStatusChange: (value: ConvexWebhookDeliveryStatus | "all") => void;
  status: ConvexWebhookDeliveryStatus | "all";
};

export type ConvexWebhookDeliveryPaginationProps<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  classNames?: ConvexWebhookClassNames;
  copy?: Partial<ConvexWebhookDeliveryCopy>;
  onNext: () => void;
  onPrevious: () => void;
  page: ConvexWebhookDeliveryPage<EventType, EndpointId, DeliveryId, OrganizationId> | undefined;
};

export type ConvexWebhookDeliveryListProps<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  classNames?: ConvexWebhookClassNames;
  copy: ConvexWebhookDeliveryCopy;
  deliveries:
    | readonly ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>[]
    | undefined;
  formatTimestamp?: (timestamp: number) => string;
  renderFailureBadge?: (failureKind: ConvexWebhookDeliveryFailureKind) => ReactNode;
  renderTag?: (label: string) => ReactNode;
};

export type ConvexExhaustedWebhookDeliveryListProps<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = ConvexWebhookDeliveryListProps<EventType, EndpointId, DeliveryId, OrganizationId> & {
  onRetry: (deliveryId: DeliveryId) => void;
  retryingDeliveryId: DeliveryId | null;
};

export type ConvexWebhookCreateEndpointResult = {
  secret?: string | null;
};

export type ConvexWebhookRotateSecretResult = {
  secret: string;
};

export type ConvexWebhookSettingsFunctionReferences<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  listEndpoints: FunctionReference<
    "query",
    "public",
    EmptyArgs,
    readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[]
  >;
  listExhaustedDeliveries: FunctionReference<
    "query",
    "public",
    { limit?: number },
    readonly ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>[]
  >;
  listRecentDeliveries: FunctionReference<
    "query",
    "public",
    {
      endpointId?: EndpointId;
      eventType?: EventType;
      limit?: number;
      offset?: number;
      status?: ConvexWebhookDeliveryStatus;
    },
    ConvexWebhookDeliveryPage<EventType, EndpointId, DeliveryId, OrganizationId>
  >;
  createEndpoint: FunctionReference<
    "mutation",
    "public",
    {
      description?: string;
      events: string[];
      requestId?: string;
      url: string;
    },
    ConvexWebhookCreateEndpointResult
  >;
  updateEndpoint: FunctionReference<
    "mutation",
    "public",
    {
      description?: string;
      endpointId: string;
      events: string[];
      url: string;
    },
    unknown
  >;
  rotateEndpointSecret: FunctionReference<
    "mutation",
    "public",
    { endpointId: string },
    ConvexWebhookRotateSecretResult
  >;
  archiveEndpoint: FunctionReference<"mutation", "public", { endpointId: string }, unknown>;
  disableEndpoint: FunctionReference<"mutation", "public", { endpointId: string }, unknown>;
  removeEndpoint: FunctionReference<"mutation", "public", { endpointId: string }, unknown>;
  sendTest: FunctionReference<
    "mutation",
    "public",
    { endpointId: string; requestId?: string },
    unknown
  >;
  retryDelivery: FunctionReference<"mutation", "public", { deliveryId: string }, unknown>;
  triggerProcessing: FunctionReference<"mutation", "public", { limit?: number }, unknown>;
};

export type ConvexWebhookSettingsSurfaceCopy = {
  actionErrorTitle?: string;
  create?: ConvexWebhookCreateFormCopy;
  deliveries?: Partial<ConvexWebhookDeliveryCopy>;
  endpoints?: Partial<ConvexWebhookEndpointListCopy>;
  exhaustedDeliveries?: Partial<ConvexWebhookDeliveryCopy>;
  processQueueLabel?: string;
  secretTitle?: string;
};

export type ConvexWebhookSettingsSurfaceProps<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
> = {
  captureEvent?: (name: string, properties: Record<string, unknown>) => void;
  classNames?: ConvexWebhookClassNames;
  confirmDeleteEndpoint?: (args: { endpointId: EndpointId }) => boolean | Promise<boolean>;
  copy?: ConvexWebhookSettingsSurfaceCopy;
  createRequestId: (prefix: string) => string;
  deliveryLimit?: number;
  enabled: boolean;
  eventOptions: readonly EventType[];
  exhaustedDeliveryLimit?: number;
  formatTimestamp?: (timestamp: number) => string;
  getErrorMessage?: (error: unknown, fallback: string) => string;
  organizationId?: string;
  refs: ConvexWebhookSettingsFunctionReferences<EventType, EndpointId, DeliveryId, OrganizationId>;
  renderActionError?: (message: string) => ReactNode;
  renderFailureBadge?: (failureKind: ConvexWebhookDeliveryFailureKind) => ReactNode;
  renderProcessQueueButton?: (args: { label: string; onClick: () => void }) => ReactNode;
  renderSecret?: (args: { secret: string; title: string }) => ReactNode;
  renderTag?: (label: string) => ReactNode;
};

type EmptyArgs = Record<string, never>;
type MutationRunner<Args, Result> = (args: Args) => Promise<Result>;

const defaultCreateCopy = {
  createLabel: "Create webhook endpoint",
  creatingLabel: "Creating...",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Primary production endpoint",
  urlLabel: "Endpoint URL",
  urlPlaceholder: "https://example.com/webhooks",
} satisfies Required<ConvexWebhookCreateFormCopy>;

const defaultEndpointCopy = {
  allEventsLabel: "All events",
  archiveLabel: "Archive",
  deleteLabel: "Delete permanently",
  descriptionLabel: "Description",
  disableLabel: "Disable",
  endpointUrlLabel: "Endpoint URL",
  loadingMessage: "Loading webhook endpoints...",
  rotateSecretLabel: "Rotate secret",
  saveLabel: "Save changes",
  secretLabel: "Secret",
  sendingTestLabel: "Sending...",
  sendTestLabel: "Send test",
} satisfies Omit<ConvexWebhookEndpointListCopy, "emptyMessage">;

const defaultDeliveryCopy = {
  allEndpointsLabel: "All endpoints",
  allEventTypesLabel: "All event types",
  allStatusesLabel: "All statuses",
  createdLabel: "Created",
  endpointFilterLabel: "Filter by endpoint",
  eventFilterLabel: "Filter by event type",
  eventIdLabel: "Event ID",
  exhaustedDescription: "Terminal webhook failures needing operator attention.",
  exhaustedLabel: "Exhausted",
  exhaustedLoadingMessage: "Loading exhausted deliveries...",
  exhaustedTitle: "Exhausted deliveries",
  failureKindLabel: "Failure kind",
  historyDescription: "Recent queued, delivered, and failed webhook attempts.",
  historyTitle: "Delivery history",
  loadingMessage: "Loading delivery history...",
  nextLabel: "Next",
  ofLabel: "of",
  previousLabel: "Previous",
  recoveredLabel: "Recovered",
  responseLabel: "Response",
  retryDueLabel: "Retry due",
  retryingLabel: "Retrying...",
  retryLabel: "Retry",
  showingLabel: "Showing",
  statusFilterLabel: "Filter by status",
} satisfies Omit<ConvexWebhookDeliveryCopy, "emptyMessage">;

const deliveryStatuses = ["pending", "processing", "delivered", "failed"] as const;

export function canSubmitConvexWebhookCreateForm({
  creating,
  enabled,
  url,
}: {
  creating: boolean;
  enabled: boolean;
  url: string;
}): boolean {
  return enabled && !creating && url.trim().length > 0;
}

export function formatConvexWebhookTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function getConvexWebhookFailureKindLabel(
  failureKind: ConvexWebhookDeliveryFailureKind,
): string {
  return failureKind.replaceAll("_", " ");
}

export function getConvexWebhookFailureKindTone(
  failureKind: ConvexWebhookDeliveryFailureKind,
): "destructive" | "warning" | "secondary" {
  if (failureKind === "client_error" || failureKind === "endpoint_inactive") {
    return "destructive";
  }
  if (failureKind === "rate_limited" || failureKind === "server_error") {
    return "warning";
  }
  return "secondary";
}

export function getConvexWebhookMutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return fallback;
}

export function ConvexWebhookSettingsSurface<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  captureEvent,
  classNames,
  confirmDeleteEndpoint,
  copy,
  createRequestId,
  deliveryLimit = 10,
  enabled,
  eventOptions,
  exhaustedDeliveryLimit = 5,
  formatTimestamp,
  getErrorMessage = getConvexWebhookMutationErrorMessage,
  organizationId,
  refs,
  renderActionError,
  renderFailureBadge,
  renderProcessQueueButton,
  renderSecret,
  renderTag,
}: ConvexWebhookSettingsSurfaceProps<EventType, EndpointId, DeliveryId, OrganizationId>) {
  const webhookEndpoints = useQuery(refs.listEndpoints, {});
  const exhaustedDeliveries = useQuery(refs.listExhaustedDeliveries, {
    limit: exhaustedDeliveryLimit,
  });
  const deliveries = useConvexWebhookDeliveryPage({
    deliveryLimit,
    refs,
  });
  const endpointActions = useConvexWebhookEndpointActions({
    captureEvent,
    createRequestId,
    getErrorMessage,
    organizationId,
    refs,
  });
  const endpointCopy = resolveSettingsEndpointCopy(copy?.endpoints);
  const deliveryCopy = resolveSettingsDeliveryCopy(copy?.deliveries);
  const exhaustedCopy = resolveSettingsExhaustedDeliveryCopy(copy?.exhaustedDeliveries);
  const processQueueLabel = copy?.processQueueLabel ?? "Process webhook queue now";
  const secretTitle = copy?.secretTitle ?? "Webhook secret. Copy now.";

  return (
    <>
      <ConvexWebhookCreateSection<EventType>
        actions={endpointActions}
        classNames={classNames}
        copy={copy?.create}
        enabled={enabled}
        eventOptions={eventOptions}
        renderActionError={renderActionError}
        renderSecret={renderSecret}
        secretTitle={secretTitle}
        title={copy?.actionErrorTitle ?? "Action failed"}
      />
      <ConvexWebhookEndpointSection<EventType, EndpointId>
        actions={endpointActions}
        classNames={classNames}
        confirmDeleteEndpoint={confirmDeleteEndpoint}
        copy={endpointCopy}
        endpoints={webhookEndpoints}
        eventOptions={eventOptions}
        renderTag={renderTag}
      />
      <ConvexWebhookProcessQueueSlot
        classNames={classNames}
        label={processQueueLabel}
        onClick={endpointActions.processQueue}
        renderProcessQueueButton={renderProcessQueueButton}
      />
      <ConvexWebhookDeliverySection<EventType, EndpointId, DeliveryId, OrganizationId>
        classNames={classNames}
        copy={deliveryCopy}
        deliveries={deliveries}
        endpoints={webhookEndpoints}
        eventOptions={eventOptions}
        formatTimestamp={formatTimestamp}
        renderFailureBadge={renderFailureBadge}
        renderTag={renderTag}
      />
      <ConvexExhaustedWebhookDeliveryList<EventType, EndpointId, DeliveryId, OrganizationId>
        classNames={classNames}
        copy={exhaustedCopy}
        deliveries={exhaustedDeliveries}
        formatTimestamp={formatTimestamp}
        onRetry={endpointActions.retryDelivery}
        renderFailureBadge={renderFailureBadge}
        renderTag={renderTag}
        retryingDeliveryId={endpointActions.retryingDeliveryId}
      />
    </>
  );
}

function ConvexWebhookCreateSection<EventType extends string = string>({
  actions,
  classNames,
  copy,
  enabled,
  eventOptions,
  renderActionError,
  renderSecret,
  secretTitle,
  title,
}: {
  actions: Pick<
    ReturnType<typeof useConvexWebhookEndpointActions<EventType, string, string, string>>,
    | "actionError"
    | "create"
    | "createdWebhookSecret"
    | "creatingWebhook"
    | "setWebhookDescription"
    | "setWebhookEvents"
    | "setWebhookUrl"
    | "webhookDescription"
    | "webhookEvents"
    | "webhookUrl"
  >;
  classNames: ConvexWebhookClassNames | undefined;
  copy: ConvexWebhookCreateFormCopy | undefined;
  enabled: boolean;
  eventOptions: readonly EventType[];
  renderActionError: ConvexWebhookSettingsSurfaceProps["renderActionError"];
  renderSecret: ConvexWebhookSettingsSurfaceProps["renderSecret"];
  secretTitle: string;
  title: string;
}) {
  return (
    <>
      <ConvexWebhookCreateForm<EventType>
        classNames={classNames}
        copy={copy}
        creating={actions.creatingWebhook}
        enabled={enabled}
        eventOptions={eventOptions}
        onDescriptionChange={actions.setWebhookDescription}
        onEventsChange={actions.setWebhookEvents}
        onSubmit={actions.create}
        onUrlChange={actions.setWebhookUrl}
        state={{
          description: actions.webhookDescription,
          events: actions.webhookEvents,
          url: actions.webhookUrl,
        }}
      />
      <ConvexWebhookSecretSlot
        classNames={classNames}
        renderSecret={renderSecret}
        secret={actions.createdWebhookSecret}
        title={secretTitle}
      />
      <ConvexWebhookActionErrorSlot
        classNames={classNames}
        message={actions.actionError}
        renderActionError={renderActionError}
        title={title}
      />
    </>
  );
}

function ConvexWebhookEndpointSection<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  actions,
  classNames,
  confirmDeleteEndpoint,
  copy,
  endpoints,
  eventOptions,
  renderTag,
}: {
  actions: Pick<
    ReturnType<typeof useConvexWebhookEndpointActions<EventType, EndpointId, string, string>>,
    | "archive"
    | "disable"
    | "removeWithConfirmation"
    | "rotateSecret"
    | "save"
    | "sendTest"
    | "sendingTestEndpointId"
  >;
  classNames: ConvexWebhookClassNames | undefined;
  confirmDeleteEndpoint:
    | ((args: { endpointId: EndpointId }) => boolean | Promise<boolean>)
    | undefined;
  copy: ConvexWebhookEndpointListCopy;
  endpoints: readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] | undefined;
  eventOptions: readonly EventType[];
  renderTag: ConvexWebhookEndpointListProps<EventType, EndpointId>["renderTag"];
}) {
  return (
    <ConvexWebhookEndpointList<EventType, EndpointId>
      classNames={classNames}
      copy={copy}
      endpoints={endpoints}
      eventOptions={eventOptions}
      onArchive={actions.archive}
      onDelete={(endpointId) => {
        void actions.removeWithConfirmation(endpointId, confirmDeleteEndpoint);
      }}
      onDisable={actions.disable}
      onRotateSecret={actions.rotateSecret}
      onSave={actions.save}
      onSendTest={actions.sendTest}
      renderTag={renderTag}
      sendingTestEndpointId={actions.sendingTestEndpointId}
    />
  );
}

function ConvexWebhookDeliverySection<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  classNames,
  copy,
  deliveries,
  endpoints,
  eventOptions,
  formatTimestamp,
  renderFailureBadge,
  renderTag,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: ConvexWebhookDeliveryCopy;
  deliveries: ReturnType<
    typeof useConvexWebhookDeliveryPage<EventType, EndpointId, DeliveryId, OrganizationId>
  >;
  endpoints: readonly ConvexWebhookEndpointListItem<EventType, EndpointId>[] | undefined;
  eventOptions: readonly EventType[];
  formatTimestamp: ((timestamp: number) => string) | undefined;
  renderFailureBadge: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderFailureBadge"];
  renderTag: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderTag"];
}) {
  return (
    <>
      <ConvexWebhookDeliveryFilters<EventType, EndpointId>
        classNames={classNames}
        endpointId={deliveries.deliveryEndpointId}
        endpoints={endpoints}
        eventOptions={eventOptions}
        eventType={deliveries.deliveryEventType}
        onEndpointIdChange={(value) => {
          deliveries.setDeliveryEndpointId(value);
          deliveries.resetOffset();
        }}
        onEventTypeChange={(value) => {
          deliveries.setDeliveryEventType(value);
          deliveries.resetOffset();
        }}
        onStatusChange={(value) => {
          deliveries.setDeliveryStatus(value);
          deliveries.resetOffset();
        }}
        status={deliveries.deliveryStatus}
      />
      <ConvexWebhookDeliveryPagination<EventType, EndpointId, DeliveryId, OrganizationId>
        classNames={classNames}
        onNext={deliveries.nextPage}
        onPrevious={deliveries.previousPage}
        page={deliveries.webhookDeliveriesPage}
      />
      <ConvexWebhookDeliveryList<EventType, EndpointId, DeliveryId, OrganizationId>
        classNames={classNames}
        copy={copy}
        deliveries={deliveries.webhookDeliveriesPage?.items}
        formatTimestamp={formatTimestamp}
        renderFailureBadge={renderFailureBadge}
        renderTag={renderTag}
      />
    </>
  );
}

function ConvexWebhookSecretSlot({
  classNames,
  renderSecret,
  secret,
  title,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  renderSecret: ConvexWebhookSettingsSurfaceProps["renderSecret"];
  secret: string | null;
  title: string;
}) {
  if (!secret) {
    return null;
  }

  return (
    renderSecret?.({ secret, title }) ?? (
      <ConvexWebhookSecretNotice classNames={classNames} secret={secret} title={title} />
    )
  );
}

function ConvexWebhookActionErrorSlot({
  classNames,
  message,
  renderActionError,
  title,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  message: string | null;
  renderActionError: ConvexWebhookSettingsSurfaceProps["renderActionError"];
  title: string;
}) {
  if (!message) {
    return null;
  }

  return (
    renderActionError?.(message) ?? (
      <ConvexWebhookActionErrorNotice classNames={classNames} message={message} title={title} />
    )
  );
}

function ConvexWebhookProcessQueueSlot({
  classNames,
  label,
  onClick,
  renderProcessQueueButton,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  label: string;
  onClick: () => void;
  renderProcessQueueButton: ConvexWebhookSettingsSurfaceProps["renderProcessQueueButton"];
}) {
  return (
    renderProcessQueueButton?.({ label, onClick }) ?? (
      <button className={secondaryButtonClassName(classNames)} onClick={onClick} type="button">
        {label}
      </button>
    )
  );
}

export function ConvexWebhookCreateForm<EventType extends string = string>({
  classNames,
  copy,
  creating,
  enabled,
  eventOptions,
  onDescriptionChange,
  onEventsChange,
  onSubmit,
  onUrlChange,
  state,
}: ConvexWebhookCreateFormProps<EventType>) {
  const resolvedCopy = resolveCreateCopy(copy);
  const canCreate = canSubmitConvexWebhookCreateForm({
    creating,
    enabled,
    url: state.url,
  });

  return (
    <div
      className={cn("border-foreground/10 bg-background/20 rounded-lg border", classNames?.card)}
    >
      <div className={cn("space-y-3 p-5", classNames?.cardContent)}>
        <label className={cn("block space-y-2 text-sm", classNames?.label)}>
          <span className={cn("text-foreground/70", classNames?.labelText)}>
            {resolvedCopy.urlLabel}
          </span>
          <input
            className={inputClassName(classNames)}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder={resolvedCopy.urlPlaceholder}
            value={state.url}
          />
        </label>
        <label className={cn("block space-y-2 text-sm", classNames?.label)}>
          <span className={cn("text-foreground/70", classNames?.labelText)}>
            {resolvedCopy.descriptionLabel}
          </span>
          <input
            className={inputClassName(classNames)}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={resolvedCopy.descriptionPlaceholder}
            value={state.description}
          />
        </label>
        <ConvexWebhookEventPills
          classNames={classNames}
          disabled={!enabled}
          eventOptions={eventOptions}
          onChange={onEventsChange}
          selected={state.events}
        />
        <button
          className={cn(
            primaryButtonClassName(classNames),
            !canCreate && classNames?.primaryButtonDisabled,
          )}
          disabled={!canCreate}
          onClick={onSubmit}
          type="button"
        >
          {creating ? resolvedCopy.creatingLabel : resolvedCopy.createLabel}
        </button>
      </div>
    </div>
  );
}

export function ConvexWebhookEndpointList<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoints,
  eventOptions,
  onArchive,
  onDelete,
  onDisable,
  onRotateSecret,
  onSave,
  onSendTest,
  renderTag,
  sendingTestEndpointId,
}: ConvexWebhookEndpointListProps<EventType, EndpointId>) {
  const resolvedCopy = resolveEndpointCopy(copy);

  if (endpoints === undefined) {
    return <p className={stateTextClassName(classNames)}>{resolvedCopy.loadingMessage}</p>;
  }

  if (endpoints.length === 0) {
    return <p className={stateTextClassName(classNames)}>{resolvedCopy.emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-3", classNames?.endpointList)}>
      {endpoints.map((endpoint) => (
        <ConvexWebhookEndpointCard
          classNames={classNames}
          copy={resolvedCopy}
          endpoint={endpoint}
          eventOptions={eventOptions}
          key={endpoint._id}
          onArchive={onArchive}
          onDelete={onDelete}
          onDisable={onDisable}
          onRotateSecret={onRotateSecret}
          onSave={onSave}
          onSendTest={onSendTest}
          renderTag={renderTag}
          sendingTestEndpointId={sendingTestEndpointId}
        />
      ))}
    </div>
  );
}

export function ConvexWebhookDeliveryFilters<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpointId,
  endpoints,
  eventOptions,
  eventType,
  onEndpointIdChange,
  onEventTypeChange,
  onStatusChange,
  status,
}: ConvexWebhookDeliveryFiltersProps<EventType, EndpointId>) {
  const resolvedCopy = resolveDeliveryCopy({ emptyMessage: "", ...copy });
  const filterEndpoints =
    endpoints?.filter(
      (endpoint) => endpoint.status !== "archived" || endpoint._id === endpointId,
    ) ?? [];

  return (
    <div
      className={cn(
        "border-foreground/10 bg-background/20 grid gap-3 rounded-lg border p-4 md:grid-cols-3",
        classNames?.deliveryFilterGrid,
      )}
    >
      <label className={cn("block space-y-2 text-sm", classNames?.label)}>
        <span className={cn("text-foreground/70", classNames?.labelText)}>
          {resolvedCopy.endpointFilterLabel}
        </span>
        <select
          className={selectClassName(classNames)}
          onChange={(event) => {
            const value = event.target.value;
            const selectedEndpointId = filterEndpoints.find(
              (endpoint) => endpoint._id === value,
            )?._id;
            if (value === "all") {
              onEndpointIdChange("all");
            } else if (selectedEndpointId !== undefined) {
              onEndpointIdChange(selectedEndpointId);
            }
          }}
          value={endpointId}
        >
          <option value="all">{resolvedCopy.allEndpointsLabel}</option>
          {filterEndpoints.map((endpoint) => (
            <option key={endpoint._id} value={endpoint._id}>
              {endpoint.description ?? endpoint.url}
            </option>
          ))}
        </select>
      </label>
      <label className={cn("block space-y-2 text-sm", classNames?.label)}>
        <span className={cn("text-foreground/70", classNames?.labelText)}>
          {resolvedCopy.statusFilterLabel}
        </span>
        <select
          className={selectClassName(classNames)}
          onChange={(event) => {
            const value = event.target.value;
            const statusValue = deliveryStatuses.find((item) => item === value);
            if (value === "all") {
              onStatusChange("all");
            } else if (statusValue !== undefined) {
              onStatusChange(statusValue);
            }
          }}
          value={status}
        >
          <option value="all">{resolvedCopy.allStatusesLabel}</option>
          {deliveryStatuses.map((item) => (
            <option key={item} value={item}>
              {capitalize(item)}
            </option>
          ))}
        </select>
      </label>
      <label className={cn("block space-y-2 text-sm", classNames?.label)}>
        <span className={cn("text-foreground/70", classNames?.labelText)}>
          {resolvedCopy.eventFilterLabel}
        </span>
        <select
          className={selectClassName(classNames)}
          onChange={(event) => {
            const value = event.target.value;
            const selectedEventType = eventOptions.find((item) => item === value);
            if (value === "all") {
              onEventTypeChange("all");
            } else if (selectedEventType !== undefined) {
              onEventTypeChange(selectedEventType);
            }
          }}
          value={eventType}
        >
          <option value="all">{resolvedCopy.allEventTypesLabel}</option>
          {eventOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ConvexWebhookDeliveryPagination<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  classNames,
  copy,
  onNext,
  onPrevious,
  page,
}: ConvexWebhookDeliveryPaginationProps<EventType, EndpointId, DeliveryId, OrganizationId>) {
  const resolvedCopy = resolveDeliveryCopy({ emptyMessage: "", ...copy });

  if (!page) {
    return null;
  }

  const firstItem = page.items.length === 0 ? 0 : page.offset + 1;
  const lastItem = page.offset + page.items.length;

  return (
    <div className="border-foreground/10 bg-background/20 text-foreground/60 flex items-center justify-between rounded-lg border p-4 text-sm">
      <p className="tabular-nums">
        {resolvedCopy.showingLabel} {firstItem}-{lastItem} {resolvedCopy.ofLabel} {page.total}
      </p>
      <div className="flex gap-2">
        <button
          className={secondaryButtonClassName(classNames)}
          disabled={page.offset === 0}
          onClick={onPrevious}
          type="button"
        >
          {resolvedCopy.previousLabel}
        </button>
        <button
          className={secondaryButtonClassName(classNames)}
          disabled={!page.hasMore}
          onClick={onNext}
          type="button"
        >
          {resolvedCopy.nextLabel}
        </button>
      </div>
    </div>
  );
}

export function ConvexWebhookDeliveryList<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  classNames,
  copy,
  deliveries,
  formatTimestamp = formatConvexWebhookTimestamp,
  renderFailureBadge,
  renderTag,
}: ConvexWebhookDeliveryListProps<EventType, EndpointId, DeliveryId, OrganizationId>) {
  const resolvedCopy = resolveDeliveryCopy(copy);

  if (deliveries === undefined) {
    return <p className={stateTextClassName(classNames)}>{resolvedCopy.loadingMessage}</p>;
  }

  if (deliveries.length === 0) {
    return <p className={stateTextClassName(classNames)}>{resolvedCopy.emptyMessage}</p>;
  }

  return (
    <div
      className={cn(
        "border-foreground/10 bg-background/20 space-y-3 rounded-lg border p-4",
        classNames?.deliveryPanel,
      )}
    >
      <div className="space-y-1">
        <p className="text-foreground/45 text-xs uppercase">{resolvedCopy.historyTitle}</p>
        <p className="text-foreground/60 text-sm text-pretty">{resolvedCopy.historyDescription}</p>
      </div>
      <div className="space-y-3">
        {deliveries.map((delivery) => (
          <ConvexWebhookDeliveryCard
            classNames={classNames}
            copy={resolvedCopy}
            delivery={delivery}
            formatTimestamp={formatTimestamp}
            key={delivery._id}
            renderFailureBadge={renderFailureBadge}
            renderTag={renderTag}
          />
        ))}
      </div>
    </div>
  );
}

export function ConvexExhaustedWebhookDeliveryList<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  classNames,
  copy,
  deliveries,
  formatTimestamp = formatConvexWebhookTimestamp,
  onRetry,
  renderFailureBadge,
  renderTag,
  retryingDeliveryId,
}: ConvexExhaustedWebhookDeliveryListProps<EventType, EndpointId, DeliveryId, OrganizationId>) {
  const resolvedCopy = resolveDeliveryCopy(copy);

  if (deliveries === undefined) {
    return <p className={stateTextClassName(classNames)}>{resolvedCopy.exhaustedLoadingMessage}</p>;
  }

  if (deliveries.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-4",
        classNames?.exhaustedPanel,
      )}
    >
      <div className="space-y-1">
        <p className="text-destructive/70 text-xs uppercase">{resolvedCopy.exhaustedTitle}</p>
        <p className="text-destructive/80 text-sm text-pretty">
          {resolvedCopy.exhaustedDescription}
        </p>
      </div>
      <div className="space-y-3">
        {deliveries.map((delivery) => (
          <ConvexWebhookDeliveryCard
            actions={
              <button
                className={secondaryButtonClassName(classNames)}
                disabled={retryingDeliveryId === delivery._id}
                onClick={() => onRetry(delivery._id)}
                type="button"
              >
                {retryingDeliveryId === delivery._id
                  ? resolvedCopy.retryingLabel
                  : resolvedCopy.retryLabel}
              </button>
            }
            classNames={classNames}
            copy={resolvedCopy}
            delivery={delivery}
            formatTimestamp={formatTimestamp}
            key={delivery._id}
            renderFailureBadge={renderFailureBadge}
            renderTag={renderTag}
          />
        ))}
      </div>
    </div>
  );
}

function useConvexWebhookDeliveryPage<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  deliveryLimit,
  refs,
}: {
  deliveryLimit: number;
  refs: ConvexWebhookSettingsFunctionReferences<EventType, EndpointId, DeliveryId, OrganizationId>;
}) {
  const [deliveryEndpointId, setDeliveryEndpointId] = useState<EndpointId | "all">("all");
  const [deliveryStatus, setDeliveryStatus] = useState<ConvexWebhookDeliveryStatus | "all">("all");
  const [deliveryEventType, setDeliveryEventType] = useState<EventType | "all">("all");
  const [deliveryOffset, setDeliveryOffset] = useState(0);
  const webhookDeliveriesPage = useQuery(refs.listRecentDeliveries, {
    endpointId: deliveryEndpointId === "all" ? undefined : deliveryEndpointId,
    eventType: deliveryEventType === "all" ? undefined : deliveryEventType,
    limit: deliveryLimit,
    offset: deliveryOffset,
    status: deliveryStatus === "all" ? undefined : deliveryStatus,
  });

  return {
    deliveryEndpointId,
    deliveryEventType,
    deliveryStatus,
    nextPage: () => setDeliveryOffset((current) => current + deliveryLimit),
    previousPage: () => setDeliveryOffset((current) => Math.max(0, current - deliveryLimit)),
    resetOffset: () => setDeliveryOffset(0),
    setDeliveryEndpointId,
    setDeliveryEventType,
    setDeliveryStatus,
    webhookDeliveriesPage,
  };
}

function useConvexWebhookEndpointActions<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  captureEvent,
  createRequestId,
  getErrorMessage,
  organizationId,
  refs,
}: {
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  createRequestId: (prefix: string) => string;
  getErrorMessage: (error: unknown, fallback: string) => string;
  organizationId: string | undefined;
  refs: ConvexWebhookSettingsFunctionReferences<EventType, EndpointId, DeliveryId, OrganizationId>;
}) {
  const mutations = useConvexWebhookEndpointMutationRunners<EventType, EndpointId, DeliveryId>(
    refs,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const setMutationError = (error: unknown, fallback: string) =>
    setActionError(getErrorMessage(error, fallback));
  const createState = useConvexWebhookCreateActionState<EventType>({
    captureEvent,
    createRequestId,
    createWebhookEndpoint: mutations.createWebhookEndpoint,
    organizationId,
    setActionError,
    setMutationError,
  });
  const retryState = useConvexWebhookRetryActionState<DeliveryId>({
    captureEvent,
    retryWebhookDelivery: mutations.retryWebhookDelivery,
    setActionError,
    setMutationError,
  });
  const sendTestState = useConvexWebhookSendTestActionState<EndpointId>({
    createRequestId,
    sendTestWebhook: mutations.sendTestWebhook,
    setActionError,
    setMutationError,
  });
  const endpointMutationActions = createConvexWebhookEndpointMutationActions<EndpointId>({
    mutations,
    setActionError,
    setCreatedWebhookSecret: createState.setCreatedWebhookSecret,
    setMutationError,
  });

  return {
    actionError,
    ...createState,
    ...retryState,
    ...sendTestState,
    ...endpointMutationActions,
  };
}

function createConvexWebhookEndpointMutationActions<EndpointId extends string = string>({
  mutations,
  setActionError,
  setCreatedWebhookSecret,
  setMutationError,
}: {
  mutations: Pick<
    ReturnType<typeof useConvexWebhookEndpointMutationRunners<string, EndpointId, string>>,
    | "archiveWebhookEndpoint"
    | "disableWebhookEndpoint"
    | "removeWebhookEndpoint"
    | "rotateWebhookSecret"
    | "triggerProcessing"
    | "updateWebhookEndpoint"
  >;
  setActionError: (error: string | null) => void;
  setCreatedWebhookSecret: (secret: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
}) {
  const remove = (endpointId: EndpointId) => {
    runWebhookEndpointMutation(
      mutations.removeWebhookEndpoint,
      endpointId,
      setActionError,
      setMutationError,
      "Could not delete webhook endpoint.",
    );
  };

  return {
    archive: (endpointId: EndpointId) =>
      runWebhookEndpointMutation(
        mutations.archiveWebhookEndpoint,
        endpointId,
        setActionError,
        setMutationError,
        "Could not archive webhook endpoint.",
      ),
    disable: (endpointId: EndpointId) =>
      runWebhookEndpointMutation(
        mutations.disableWebhookEndpoint,
        endpointId,
        setActionError,
        setMutationError,
        "Could not disable webhook endpoint.",
      ),
    processQueue: () =>
      runWebhookQueueProcessing(mutations.triggerProcessing, setActionError, setMutationError),
    remove,
    removeWithConfirmation: (
      endpointId: EndpointId,
      confirmDeleteEndpoint:
        | ((args: { endpointId: EndpointId }) => boolean | Promise<boolean>)
        | undefined,
    ) => removeWebhookEndpointAfterConfirmation(endpointId, confirmDeleteEndpoint, remove),
    rotateSecret: (endpointId: EndpointId) =>
      rotateWebhookSecretWithState({
        endpointId,
        rotateWebhookSecret: mutations.rotateWebhookSecret,
        setActionError,
        setCreatedWebhookSecret,
        setMutationError,
      }),
    save: (
      endpointId: EndpointId,
      values: { description?: string; events: string[]; url: string },
    ) =>
      saveWebhookEndpoint(
        endpointId,
        values,
        mutations.updateWebhookEndpoint,
        setActionError,
        setMutationError,
      ),
  };
}

function runWebhookEndpointMutation<EndpointId extends string = string>(
  mutation: MutationRunner<{ endpointId: EndpointId }, unknown>,
  endpointId: EndpointId,
  setActionError: (error: string | null) => void,
  setMutationError: (error: unknown, fallback: string) => void,
  fallback: string,
) {
  setActionError(null);
  void mutation({ endpointId }).catch((error: unknown) => {
    setMutationError(error, fallback);
  });
}

function runWebhookQueueProcessing(
  triggerProcessing: MutationRunner<{ limit: number }, unknown>,
  setActionError: (error: string | null) => void,
  setMutationError: (error: unknown, fallback: string) => void,
) {
  setActionError(null);
  void triggerProcessing({ limit: 20 }).catch((error: unknown) => {
    setMutationError(error, "Could not process webhook queue.");
  });
}

async function removeWebhookEndpointAfterConfirmation<EndpointId extends string = string>(
  endpointId: EndpointId,
  confirmDeleteEndpoint:
    | ((args: { endpointId: EndpointId }) => boolean | Promise<boolean>)
    | undefined,
  remove: (endpointId: EndpointId) => void,
) {
  const confirmed = confirmDeleteEndpoint ? await confirmDeleteEndpoint({ endpointId }) : true;
  if (confirmed) {
    remove(endpointId);
  }
}

function rotateWebhookSecretWithState<EndpointId extends string = string>({
  endpointId,
  rotateWebhookSecret,
  setActionError,
  setCreatedWebhookSecret,
  setMutationError,
}: {
  endpointId: EndpointId;
  rotateWebhookSecret: MutationRunner<{ endpointId: EndpointId }, ConvexWebhookRotateSecretResult>;
  setActionError: (error: string | null) => void;
  setCreatedWebhookSecret: (secret: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
}) {
  setActionError(null);
  void rotateWebhookSecret({ endpointId })
    .then((result) => {
      setCreatedWebhookSecret(result.secret);
    })
    .catch((error: unknown) => {
      setMutationError(error, "Could not rotate webhook secret.");
    });
}

function saveWebhookEndpoint<EventType extends string = string, EndpointId extends string = string>(
  endpointId: EndpointId,
  values: { description?: string; events: EventType[]; url: string },
  updateWebhookEndpoint: MutationRunner<
    {
      description?: string;
      endpointId: EndpointId;
      events: EventType[];
      url: string;
    },
    unknown
  >,
  setActionError: (error: string | null) => void,
  setMutationError: (error: unknown, fallback: string) => void,
) {
  setActionError(null);
  void updateWebhookEndpoint({ endpointId, ...values }).catch((error: unknown) => {
    setMutationError(error, "Could not save webhook endpoint.");
  });
}

function useConvexWebhookCreateActionState<EventType extends string = string>({
  captureEvent,
  createRequestId,
  createWebhookEndpoint,
  organizationId,
  setActionError,
  setMutationError,
}: {
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  createRequestId: (prefix: string) => string;
  createWebhookEndpoint: MutationRunner<
    {
      description?: string;
      events: EventType[];
      requestId: string;
      url: string;
    },
    ConvexWebhookCreateEndpointResult
  >;
  organizationId: string | undefined;
  setActionError: (error: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<EventType[]>([]);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const createRequestIdRef = useRef<string | null>(null);

  return {
    create: () =>
      createWebhookEndpointWithState({
        captureEvent,
        createRequestId,
        createRequestIdRef,
        createWebhookEndpoint,
        organizationId,
        setActionError,
        setCreatedWebhookSecret,
        setCreatingWebhook,
        setMutationError,
        setWebhookDescription,
        setWebhookEvents,
        setWebhookUrl,
        webhookDescription,
        webhookEvents,
        webhookUrl,
      }),
    createdWebhookSecret,
    creatingWebhook,
    setWebhookDescription,
    setWebhookEvents,
    setWebhookUrl,
    setCreatedWebhookSecret,
    webhookDescription,
    webhookEvents,
    webhookUrl,
  };
}

function useConvexWebhookRetryActionState<DeliveryId extends string = string>({
  captureEvent,
  retryWebhookDelivery,
  setActionError,
  setMutationError,
}: {
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  retryWebhookDelivery: MutationRunner<{ deliveryId: DeliveryId }, unknown>;
  setActionError: (error: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
}) {
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<DeliveryId | null>(null);

  return {
    retryDelivery: (deliveryId: DeliveryId) =>
      retryWebhookDeliveryWithState({
        captureEvent,
        deliveryId,
        retryWebhookDelivery,
        setActionError,
        setMutationError,
        setRetryingDeliveryId,
      }),
    retryingDeliveryId,
  };
}

function useConvexWebhookSendTestActionState<EndpointId extends string = string>({
  createRequestId,
  sendTestWebhook,
  setActionError,
  setMutationError,
}: {
  createRequestId: (prefix: string) => string;
  sendTestWebhook: MutationRunner<{ endpointId: EndpointId; requestId: string }, unknown>;
  setActionError: (error: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
}) {
  const [sendingTestEndpointId, setSendingTestEndpointId] = useState<EndpointId | null>(null);
  const sendTestRequestIdsRef = useRef(new Map<EndpointId, string>());

  return {
    sendTest: (endpointId: EndpointId) =>
      sendTestWebhookWithState({
        createRequestId,
        endpointId,
        sendTestRequestIdsRef,
        sendTestWebhook,
        setActionError,
        setMutationError,
        setSendingTestEndpointId,
      }),
    sendingTestEndpointId,
  };
}

function createWebhookEndpointWithState<EventType extends string = string>({
  captureEvent,
  createRequestId,
  createRequestIdRef,
  createWebhookEndpoint,
  organizationId,
  setActionError,
  setCreatedWebhookSecret,
  setCreatingWebhook,
  setMutationError,
  setWebhookDescription,
  setWebhookEvents,
  setWebhookUrl,
  webhookDescription,
  webhookEvents,
  webhookUrl,
}: {
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  createRequestId: (prefix: string) => string;
  createRequestIdRef: { current: string | null };
  createWebhookEndpoint: MutationRunner<
    {
      description?: string;
      events: EventType[];
      requestId: string;
      url: string;
    },
    ConvexWebhookCreateEndpointResult
  >;
  organizationId: string | undefined;
  setActionError: (error: string | null) => void;
  setCreatedWebhookSecret: (secret: string | null) => void;
  setCreatingWebhook: (creating: boolean) => void;
  setMutationError: (error: unknown, fallback: string) => void;
  setWebhookDescription: (description: string) => void;
  setWebhookEvents: (events: EventType[]) => void;
  setWebhookUrl: (url: string) => void;
  webhookDescription: string;
  webhookEvents: EventType[];
  webhookUrl: string;
}) {
  if (createRequestIdRef.current) {
    return;
  }
  const requestId = createRequestId("webhook_create");
  createRequestIdRef.current = requestId;
  setCreatingWebhook(true);
  setActionError(null);
  void createWebhookEndpoint({
    description: webhookDescription.trim() || undefined,
    events: webhookEvents,
    requestId,
    url: webhookUrl.trim(),
  })
    .then((result) => {
      setCreatedWebhookSecret(result.secret ?? null);
      setWebhookUrl("");
      setWebhookDescription("");
      setWebhookEvents([]);
      captureEvent?.("settings_webhook_created", organizationId ? { organizationId } : {});
    })
    .catch((error: unknown) => {
      setMutationError(error, "Could not create webhook endpoint.");
    })
    .finally(() => {
      createRequestIdRef.current = null;
      setCreatingWebhook(false);
    });
}

function retryWebhookDeliveryWithState<DeliveryId extends string = string>({
  captureEvent,
  deliveryId,
  retryWebhookDelivery,
  setActionError,
  setMutationError,
  setRetryingDeliveryId,
}: {
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  deliveryId: DeliveryId;
  retryWebhookDelivery: MutationRunner<{ deliveryId: DeliveryId }, unknown>;
  setActionError: (error: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
  setRetryingDeliveryId: (
    value: DeliveryId | null | ((current: DeliveryId | null) => DeliveryId | null),
  ) => void;
}) {
  setRetryingDeliveryId(deliveryId);
  setActionError(null);
  void retryWebhookDelivery({ deliveryId })
    .then(() => {
      captureEvent?.("webhook_delivery_retry_clicked", {
        deliveryId,
      });
    })
    .catch((error: unknown) => {
      setMutationError(error, "Could not retry webhook delivery.");
    })
    .finally(() => {
      setRetryingDeliveryId((currentDeliveryId) =>
        currentDeliveryId === deliveryId ? null : currentDeliveryId,
      );
    });
}

function sendTestWebhookWithState<EndpointId extends string = string>({
  createRequestId,
  endpointId,
  sendTestRequestIdsRef,
  sendTestWebhook,
  setActionError,
  setMutationError,
  setSendingTestEndpointId,
}: {
  createRequestId: (prefix: string) => string;
  endpointId: EndpointId;
  sendTestRequestIdsRef: { current: Map<EndpointId, string> };
  sendTestWebhook: MutationRunner<{ endpointId: EndpointId; requestId: string }, unknown>;
  setActionError: (error: string | null) => void;
  setMutationError: (error: unknown, fallback: string) => void;
  setSendingTestEndpointId: (
    value: EndpointId | null | ((current: EndpointId | null) => EndpointId | null),
  ) => void;
}) {
  if (sendTestRequestIdsRef.current.has(endpointId)) {
    return;
  }
  const requestId = createRequestId("webhook_test");
  sendTestRequestIdsRef.current.set(endpointId, requestId);
  setSendingTestEndpointId(endpointId);
  setActionError(null);
  void sendTestWebhook({ endpointId, requestId })
    .catch((error: unknown) => {
      setMutationError(error, "Could not send webhook test.");
    })
    .finally(() => {
      sendTestRequestIdsRef.current.delete(endpointId);
      setSendingTestEndpointId((currentEndpointId) =>
        currentEndpointId === endpointId ? null : currentEndpointId,
      );
    });
}

function useConvexWebhookEndpointMutationRunners<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
>(refs: ConvexWebhookSettingsFunctionReferences<EventType, EndpointId, DeliveryId>) {
  const archiveWebhookEndpoint = useGuardedConvexMutation(useMutation(refs.archiveEndpoint));
  const createWebhookEndpoint = useGuardedConvexMutation(useMutation(refs.createEndpoint));
  const disableWebhookEndpoint = useGuardedConvexMutation(useMutation(refs.disableEndpoint));
  const removeWebhookEndpoint = useGuardedConvexMutation(useMutation(refs.removeEndpoint));
  const retryWebhookDelivery = useGuardedConvexMutation(useMutation(refs.retryDelivery));
  const rotateWebhookSecret = useGuardedConvexMutation(useMutation(refs.rotateEndpointSecret));
  const sendTestWebhook = useGuardedConvexMutation(useMutation(refs.sendTest));
  const triggerProcessing = useGuardedConvexMutation(useMutation(refs.triggerProcessing));
  const updateWebhookEndpoint = useGuardedConvexMutation(useMutation(refs.updateEndpoint));

  return {
    archiveWebhookEndpoint,
    createWebhookEndpoint,
    disableWebhookEndpoint,
    removeWebhookEndpoint,
    retryWebhookDelivery,
    rotateWebhookSecret,
    sendTestWebhook,
    triggerProcessing,
    updateWebhookEndpoint,
  };
}

function ConvexWebhookEndpointCard<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  eventOptions,
  onArchive,
  onDelete,
  onDisable,
  onRotateSecret,
  onSave,
  onSendTest,
  renderTag,
  sendingTestEndpointId,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  eventOptions: readonly EventType[];
  onArchive: (endpointId: EndpointId) => void;
  onDelete: (endpointId: EndpointId) => void;
  onDisable: (endpointId: EndpointId) => void;
  onRotateSecret: (endpointId: EndpointId) => void;
  onSave: (
    endpointId: EndpointId,
    values: { url: string; description?: string; events: EventType[] },
  ) => void;
  onSendTest: (endpointId: EndpointId) => void;
  renderTag: ConvexWebhookEndpointListProps<EventType, EndpointId>["renderTag"];
  sendingTestEndpointId: EndpointId | null;
}) {
  const [url, setUrl] = useState(endpoint.url);
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [events, setEvents] = useState<EventType[]>(() => [...endpoint.events]);

  return (
    <article
      className={cn(
        "border-foreground/10 bg-background/20 rounded-lg border",
        classNames?.endpointCard,
      )}
      data-testid="webhook-endpoint-card"
    >
      <div className={cn("p-5", classNames?.cardContent)}>
        <ConvexWebhookEndpointHeader
          classNames={classNames}
          copy={copy}
          endpoint={endpoint}
          onArchive={onArchive}
          onDelete={onDelete}
          onDisable={onDisable}
          onRotateSecret={onRotateSecret}
          onSendTest={onSendTest}
          sendingTestEndpointId={sendingTestEndpointId}
        />
        <ConvexWebhookEndpointEditFields
          classNames={classNames}
          copy={copy}
          description={description}
          onDescriptionChange={setDescription}
          onUrlChange={setUrl}
          url={url}
        />
        <div className="mt-3">
          <ConvexWebhookEventPills
            classNames={classNames}
            disabled={endpoint.status !== "active"}
            eventOptions={eventOptions}
            onChange={setEvents}
            selected={events}
          />
        </div>
        <ConvexWebhookEndpointSaveRow
          classNames={classNames}
          copy={copy}
          endpoint={endpoint}
          events={events}
          onSave={onSave}
          renderTag={renderTag}
          values={{ description, url }}
        />
      </div>
    </article>
  );
}

function ConvexWebhookEndpointHeader<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  onArchive,
  onDelete,
  onDisable,
  onRotateSecret,
  onSendTest,
  sendingTestEndpointId,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  onArchive: (endpointId: EndpointId) => void;
  onDelete: (endpointId: EndpointId) => void;
  onDisable: (endpointId: EndpointId) => void;
  onRotateSecret: (endpointId: EndpointId) => void;
  onSendTest: (endpointId: EndpointId) => void;
  sendingTestEndpointId: EndpointId | null;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", classNames?.endpointHeader)}>
      <ConvexWebhookEndpointMeta classNames={classNames} copy={copy} endpoint={endpoint} />
      <ConvexWebhookEndpointActions
        classNames={classNames}
        copy={copy}
        endpoint={endpoint}
        onArchive={onArchive}
        onDelete={onDelete}
        onDisable={onDisable}
        onRotateSecret={onRotateSecret}
        onSendTest={onSendTest}
        sendingTestEndpointId={sendingTestEndpointId}
      />
    </div>
  );
}

function ConvexWebhookEndpointMeta<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
}) {
  return (
    <div className={cn("space-y-1", classNames?.endpointMeta)}>
      <p className="text-foreground font-medium">{endpoint.description ?? endpoint.url}</p>
      <p className="text-foreground/45 text-xs">{endpoint.url}</p>
      <p className="text-foreground/45 text-xs uppercase">{endpoint.status}</p>
      <p className="text-foreground/45 text-xs">
        {copy.secretLabel} {endpoint.secretPreview}
      </p>
    </div>
  );
}

function ConvexWebhookEndpointActions<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  onArchive,
  onDelete,
  onDisable,
  onRotateSecret,
  onSendTest,
  sendingTestEndpointId,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  onArchive: (endpointId: EndpointId) => void;
  onDelete: (endpointId: EndpointId) => void;
  onDisable: (endpointId: EndpointId) => void;
  onRotateSecret: (endpointId: EndpointId) => void;
  onSendTest: (endpointId: EndpointId) => void;
  sendingTestEndpointId: EndpointId | null;
}) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2", classNames?.endpointActions)}>
      <ConvexWebhookSendTestButton
        classNames={classNames}
        copy={copy}
        endpoint={endpoint}
        onSendTest={onSendTest}
        sendingTestEndpointId={sendingTestEndpointId}
      />
      <button
        className={secondaryButtonClassName(classNames)}
        onClick={() => onRotateSecret(endpoint._id)}
        type="button"
      >
        {copy.rotateSecretLabel}
      </button>
      {endpoint.status === "active" ? (
        <button
          className={secondaryButtonClassName(classNames)}
          onClick={() => onDisable(endpoint._id)}
          type="button"
        >
          {copy.disableLabel}
        </button>
      ) : null}
      {endpoint.status !== "archived" ? (
        <button
          className={warningButtonClassName(classNames)}
          onClick={() => onArchive(endpoint._id)}
          type="button"
        >
          {copy.archiveLabel}
        </button>
      ) : null}
      {endpoint.status === "archived" ? (
        <button
          className={destructiveButtonClassName(classNames)}
          onClick={() => onDelete(endpoint._id)}
          type="button"
        >
          {copy.deleteLabel}
        </button>
      ) : null}
    </div>
  );
}

function ConvexWebhookSendTestButton<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  onSendTest,
  sendingTestEndpointId,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  onSendTest: (endpointId: EndpointId) => void;
  sendingTestEndpointId: EndpointId | null;
}) {
  if (endpoint.status !== "active") {
    return null;
  }

  return (
    <button
      className={secondaryButtonClassName(classNames)}
      disabled={sendingTestEndpointId === endpoint._id}
      onClick={() => onSendTest(endpoint._id)}
      type="button"
    >
      {sendingTestEndpointId === endpoint._id ? copy.sendingTestLabel : copy.sendTestLabel}
    </button>
  );
}

function ConvexWebhookEndpointEditFields({
  classNames,
  copy,
  description,
  onDescriptionChange,
  onUrlChange,
  url,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  description: string;
  onDescriptionChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  url: string;
}) {
  return (
    <div className={cn("mt-4 grid gap-3 md:grid-cols-2", classNames?.endpointFormGrid)}>
      <label className={cn("block space-y-2 text-sm", classNames?.label)}>
        <span className={cn("text-foreground/70", classNames?.labelText)}>
          {copy.endpointUrlLabel}
        </span>
        <input
          className={inputClassName(classNames)}
          onChange={(event) => onUrlChange(event.target.value)}
          value={url}
        />
      </label>
      <label className={cn("block space-y-2 text-sm", classNames?.label)}>
        <span className={cn("text-foreground/70", classNames?.labelText)}>
          {copy.descriptionLabel}
        </span>
        <input
          className={inputClassName(classNames)}
          onChange={(event) => onDescriptionChange(event.target.value)}
          value={description}
        />
      </label>
    </div>
  );
}

function ConvexWebhookEndpointSaveRow<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  events,
  onSave,
  renderTag,
  values,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  events: EventType[];
  onSave: (
    endpointId: EndpointId,
    values: { url: string; description?: string; events: EventType[] },
  ) => void;
  renderTag: ConvexWebhookEndpointListProps<EventType, EndpointId>["renderTag"];
  values: { description: string; url: string };
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        className={primaryButtonClassName(classNames)}
        disabled={endpoint.status !== "active"}
        onClick={() =>
          onSave(endpoint._id, {
            url: values.url.trim(),
            description: values.description.trim() || undefined,
            events,
          })
        }
        type="button"
      >
        {copy.saveLabel}
      </button>
      <ConvexWebhookEndpointEventTags
        classNames={classNames}
        copy={copy}
        endpoint={endpoint}
        renderTag={renderTag}
      />
    </div>
  );
}

function ConvexWebhookEndpointEventTags<
  EventType extends string = string,
  EndpointId extends string = string,
>({
  classNames,
  copy,
  endpoint,
  renderTag,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookEndpointListCopy>;
  endpoint: ConvexWebhookEndpointListItem<EventType, EndpointId>;
  renderTag: ConvexWebhookEndpointListProps<EventType, EndpointId>["renderTag"];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {endpoint.events.length === 0
        ? renderWebhookTag(copy.allEventsLabel, classNames, renderTag)
        : endpoint.events.map((eventType) => renderWebhookTag(eventType, classNames, renderTag))}
    </div>
  );
}

function ConvexWebhookEventPills<EventType extends string>({
  classNames,
  disabled,
  eventOptions,
  onChange,
  selected,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  disabled: boolean;
  eventOptions: readonly EventType[];
  onChange: (value: EventType[]) => void;
  selected: readonly EventType[];
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", classNames?.pillList)}>
      {eventOptions.map((eventType) => {
        const isSelected = selected.includes(eventType);
        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
              isSelected
                ? "border-info/50 bg-info/10 text-info"
                : "border-foreground/10 bg-foreground/5 text-foreground/60 hover:bg-foreground/10",
              disabled && "cursor-not-allowed opacity-50",
              classNames?.pill,
              isSelected && classNames?.pillSelected,
              disabled && classNames?.pillDisabled,
            )}
            disabled={disabled}
            key={eventType}
            onClick={() =>
              onChange(
                isSelected
                  ? selected.filter((item) => item !== eventType)
                  : [...selected, eventType],
              )
            }
            type="button"
          >
            {eventType}
          </button>
        );
      })}
    </div>
  );
}

function ConvexWebhookDeliveryCard<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  actions,
  classNames,
  copy,
  delivery,
  formatTimestamp,
  renderFailureBadge,
  renderTag,
}: {
  actions?: ReactNode;
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookDeliveryCopy>;
  delivery: ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>;
  formatTimestamp: (timestamp: number) => string;
  renderFailureBadge: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderFailureBadge"];
  renderTag: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderTag"];
}) {
  return (
    <article
      className={cn(
        "border-foreground/10 bg-background/30 rounded-lg border p-4",
        classNames?.deliveryCard,
      )}
    >
      <ConvexWebhookDeliveryHeader
        actions={actions}
        classNames={classNames}
        delivery={delivery}
        renderFailureBadge={renderFailureBadge}
        renderTag={renderTag}
      />
      <ConvexWebhookDeliveryDetails
        classNames={classNames}
        copy={copy}
        delivery={delivery}
        formatTimestamp={formatTimestamp}
      />
    </article>
  );
}

function ConvexWebhookDeliveryHeader<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  actions,
  classNames,
  delivery,
  renderFailureBadge,
  renderTag,
}: {
  actions?: ReactNode;
  classNames: ConvexWebhookClassNames | undefined;
  delivery: ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>;
  renderFailureBadge: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderFailureBadge"];
  renderTag: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderTag"];
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", classNames?.deliveryHeader)}>
      <div className="space-y-1">
        <p className="text-foreground font-medium">{delivery.eventType}</p>
        <p className="text-foreground/45 text-xs">
          {delivery.endpointDescription ?? delivery.endpointUrl ?? "Unknown endpoint"}
        </p>
      </div>
      <ConvexWebhookDeliveryBadges
        actions={actions}
        classNames={classNames}
        delivery={delivery}
        renderFailureBadge={renderFailureBadge}
        renderTag={renderTag}
      />
    </div>
  );
}

function ConvexWebhookDeliveryBadges<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  actions,
  classNames,
  delivery,
  renderFailureBadge,
  renderTag,
}: {
  actions?: ReactNode;
  classNames: ConvexWebhookClassNames | undefined;
  delivery: ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>;
  renderFailureBadge: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderFailureBadge"];
  renderTag: ConvexWebhookDeliveryListProps<
    EventType,
    EndpointId,
    DeliveryId,
    OrganizationId
  >["renderTag"];
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {renderWebhookTag(
        `${delivery.status} - attempts ${delivery.attemptCount}`,
        classNames,
        renderTag,
      )}
      {delivery.failureKind
        ? renderDeliveryFailureBadge(delivery.failureKind, classNames, renderFailureBadge)
        : null}
      {delivery.recoveryCount
        ? renderWebhookTag(`recovered ${delivery.recoveryCount}x`, classNames, renderTag)
        : null}
      {actions}
    </div>
  );
}

function ConvexWebhookDeliveryDetails<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  classNames,
  copy,
  delivery,
  formatTimestamp,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  copy: Required<ConvexWebhookDeliveryCopy>;
  delivery: ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>;
  formatTimestamp: (timestamp: number) => string;
}) {
  return (
    <div className={cn("text-foreground/60 mt-3 grid gap-2 text-xs", classNames?.deliveryDetails)}>
      <p>
        {copy.eventIdLabel}: {delivery.eventId}
      </p>
      <p>
        {copy.createdLabel}: {formatTimestamp(delivery.createdAt)}
      </p>
      <ConvexWebhookDeliveryOptionalDetails
        copy={copy}
        delivery={delivery}
        formatTimestamp={formatTimestamp}
      />
      {delivery.responseBody ? (
        <pre
          className={cn(
            "border-foreground/10 bg-background/20 text-foreground/55 overflow-x-auto rounded-md border p-3 text-[11px] break-all whitespace-pre-wrap",
            classNames?.codeBlock,
          )}
        >
          {delivery.responseBody}
        </pre>
      ) : null}
    </div>
  );
}

function ConvexWebhookDeliveryOptionalDetails<
  EventType extends string = string,
  EndpointId extends string = string,
  DeliveryId extends string = string,
  OrganizationId extends string = string,
>({
  copy,
  delivery,
  formatTimestamp,
}: {
  copy: Required<ConvexWebhookDeliveryCopy>;
  delivery: ConvexWebhookDeliveryListItem<EventType, EndpointId, DeliveryId, OrganizationId>;
  formatTimestamp: (timestamp: number) => string;
}) {
  return (
    <>
      {delivery.nextAttemptAt && delivery.status === "pending" ? (
        <p>
          {copy.retryDueLabel}: {formatTimestamp(delivery.nextAttemptAt)}
        </p>
      ) : null}
      {delivery.recoveredAt ? (
        <p>
          {copy.recoveredLabel}: {formatTimestamp(delivery.recoveredAt)}
        </p>
      ) : null}
      {delivery.exhaustedAt ? (
        <p>
          {copy.exhaustedLabel}: {formatTimestamp(delivery.exhaustedAt)}
        </p>
      ) : null}
      {delivery.responseStatus ? (
        <p>
          {copy.responseLabel}: HTTP {delivery.responseStatus}
        </p>
      ) : null}
      {delivery.failureKind ? (
        <p>
          {copy.failureKindLabel}: {getConvexWebhookFailureKindLabel(delivery.failureKind)}
        </p>
      ) : null}
    </>
  );
}

function inputClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "border-foreground/10 bg-foreground/5 text-foreground placeholder:text-foreground/35 focus:border-foreground/25 h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
    classNames?.input,
  );
}

function selectClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
    classNames?.select,
  );
}

function primaryButtonClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "bg-foreground text-background hover:bg-foreground/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    classNames?.primaryButton,
  );
}

function secondaryButtonClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    classNames?.secondaryButton,
  );
}

function warningButtonClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "border-warning/30 text-warning hover:bg-warning/10 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    classNames?.warningButton,
  );
}

function destructiveButtonClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn(
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    classNames?.destructiveButton,
  );
}

function stateTextClassName(classNames: ConvexWebhookClassNames | undefined): string {
  return cn("text-foreground/50 text-sm", classNames?.stateText);
}

function renderWebhookTag(
  label: string,
  classNames: ConvexWebhookClassNames | undefined,
  renderTag: ((label: string) => ReactNode) | undefined,
): ReactNode {
  if (renderTag) {
    return renderTag(label);
  }

  return (
    <span
      className={cn(
        "border-foreground/10 text-foreground/70 inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        classNames?.tag,
      )}
      key={label}
    >
      {label}
    </span>
  );
}

function renderDeliveryFailureBadge(
  failureKind: ConvexWebhookDeliveryFailureKind,
  classNames: ConvexWebhookClassNames | undefined,
  renderFailureBadge: ((failureKind: ConvexWebhookDeliveryFailureKind) => ReactNode) | undefined,
): ReactNode {
  if (renderFailureBadge) {
    return renderFailureBadge(failureKind);
  }

  const tone = getConvexWebhookFailureKindTone(failureKind);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        tone === "destructive" && "border-destructive/25 bg-destructive/10 text-destructive",
        tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
        tone === "secondary" && "border-foreground/10 bg-foreground/10 text-foreground/80",
        classNames?.tag,
      )}
    >
      {getConvexWebhookFailureKindLabel(failureKind)}
    </span>
  );
}

function ConvexWebhookSecretNotice({
  classNames,
  secret,
  title,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  secret: string;
  title: string;
}) {
  return (
    <div className={cn("border-info/20 bg-info/10 rounded-lg border p-4", classNames?.card)}>
      <p className="text-info text-sm font-medium">{title}</p>
      <code
        className={cn(
          "border-foreground/10 bg-background/30 text-foreground/70 mt-2 block overflow-x-auto rounded-md border p-3 text-xs",
          classNames?.codeBlock,
        )}
      >
        {secret}
      </code>
    </div>
  );
}

function ConvexWebhookActionErrorNotice({
  classNames,
  message,
  title,
}: {
  classNames: ConvexWebhookClassNames | undefined;
  message: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm",
        classNames?.card,
      )}
      role="alert"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-pretty">{message}</p>
    </div>
  );
}

function resolveSettingsEndpointCopy(
  copy: Partial<ConvexWebhookEndpointListCopy> | undefined,
): ConvexWebhookEndpointListCopy {
  return {
    ...copy,
    emptyMessage: copy?.emptyMessage ?? "No webhook endpoints configured yet.",
  };
}

function resolveSettingsDeliveryCopy(
  copy: Partial<ConvexWebhookDeliveryCopy> | undefined,
): ConvexWebhookDeliveryCopy {
  return {
    ...copy,
    emptyMessage: copy?.emptyMessage ?? "No webhook deliveries yet.",
  };
}

function resolveSettingsExhaustedDeliveryCopy(
  copy: Partial<ConvexWebhookDeliveryCopy> | undefined,
): ConvexWebhookDeliveryCopy {
  return {
    ...copy,
    emptyMessage: copy?.emptyMessage ?? "No exhausted webhook deliveries.",
  };
}

function resolveCreateCopy(
  copy: ConvexWebhookCreateFormCopy | undefined,
): Required<ConvexWebhookCreateFormCopy> {
  return { ...defaultCreateCopy, ...copy };
}

function resolveEndpointCopy(
  copy: ConvexWebhookEndpointListCopy,
): Required<ConvexWebhookEndpointListCopy> {
  return { ...defaultEndpointCopy, ...copy, emptyMessage: copy.emptyMessage };
}

function resolveDeliveryCopy(
  copy: Partial<ConvexWebhookDeliveryCopy> & Pick<ConvexWebhookDeliveryCopy, "emptyMessage">,
): Required<ConvexWebhookDeliveryCopy> {
  return { ...defaultDeliveryCopy, ...copy, emptyMessage: copy.emptyMessage };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

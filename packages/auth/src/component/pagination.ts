import { getPage, type PageRequest } from "convex-helpers/server/pagination";
import type { QueryCtx } from "./_generated/server.js";
import type { DataModel, Doc, TableNames } from "./_generated/dataModel.js";
import schema from "./schema.js";

export async function getAllRows<T extends TableNames>(
  ctx: { db: QueryCtx["db"] },
  request: Omit<PageRequest<DataModel, T>, "schema" | "index"> & { index: string },
): Promise<Doc<T>[]> {
  const rows: Doc<T>[] = [];
  let startIndexKey = request.startIndexKey;
  for (;;) {
    const { page, hasMore, indexKeys } = await getPage(ctx, {
      ...request,
      startIndexKey,
      schema,
    } as PageRequest<DataModel, T>);
    rows.push(...page);
    const lastKey = indexKeys[indexKeys.length - 1];
    if (!hasMore || lastKey === undefined) {
      return rows;
    }
    startIndexKey = lastKey;
  }
}

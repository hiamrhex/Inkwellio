/**
 * The executor, re-exported from the shared domain in `publications` so callers
 * of the posts module do not reach across a module boundary.
 */
export {
  queryable,
  row,
  rows,
  runInTransaction,
  toDate,
  toNumber,
  type Db,
  type Executor,
  type Queryable,
} from "@/modules/publications";

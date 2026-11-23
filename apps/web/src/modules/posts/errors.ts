/**
 * Posts: typed failures.
 *
 * Re-exported from the publications module because that is the lower-level side
 * of the dependency, so both modules share one error shape without a cycle.
 * WP3b maps these codes at the HTTP boundary.
 */
export {
  ServiceError,
  conflict,
  forbidden,
  isServiceError,
  notFound,
  pgCode,
  validation,
  type Actor,
  type ServiceErrorCode,
} from "@/modules/publications";

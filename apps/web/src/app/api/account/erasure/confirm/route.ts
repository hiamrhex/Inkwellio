export async function POST(request: Request): Promise<Response> {
  const [{ handleErasureConfirmPost }, { invalidateErasedAccount }] = await Promise.all([
    import("@/modules/identity"),
    import("../../../_lib/cache-seam"),
  ]);
  return handleErasureConfirmPost(request, { invalidateCache: invalidateErasedAccount });
}

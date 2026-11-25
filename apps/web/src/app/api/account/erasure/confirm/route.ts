export async function POST(request: Request): Promise<Response> {
  const { handleErasureConfirmPost } = await import("@/modules/identity");
  return handleErasureConfirmPost(request);
}

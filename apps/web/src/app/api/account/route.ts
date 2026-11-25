export async function DELETE(request: Request): Promise<Response> {
  const { handleErasureConfirmPost } = await import("@/modules/identity");
  return handleErasureConfirmPost(request);
}

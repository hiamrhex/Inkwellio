export async function POST(request: Request): Promise<Response> {
  const { handleErasureRequestPost } = await import("@/modules/identity");
  return handleErasureRequestPost(request);
}

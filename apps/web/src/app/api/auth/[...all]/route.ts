export async function GET(request: Request): Promise<Response> {
  const { handleAuthGet } = await import("@/modules/identity");
  return handleAuthGet(request);
}

export async function POST(request: Request): Promise<Response> {
  const { handleAuthPost } = await import("@/modules/identity");
  return handleAuthPost(request);
}

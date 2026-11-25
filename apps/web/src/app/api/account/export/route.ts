export async function GET(request: Request): Promise<Response> {
  const { handleAccountExportGet } = await import("@/modules/identity");
  return handleAccountExportGet(request);
}

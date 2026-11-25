import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as exportGet } from "../src/app/api/account/export/route";
import { policy as exportPolicy } from "../src/app/api/account/export/policy";
import { POST as erasureRequestPost } from "../src/app/api/account/erasure/request/route";
import { policy as erasureRequestPolicy } from "../src/app/api/account/erasure/request/policy";
import { POST as erasureConfirmPost } from "../src/app/api/account/erasure/confirm/route";
import { policy as erasureConfirmPolicy } from "../src/app/api/account/erasure/confirm/policy";
import { DELETE as accountDelete } from "../src/app/api/account/route";
import { policy as accountPolicy } from "../src/app/api/account/policy";

describe("WP2b Privacy & Account Routes (Policy & Unauthenticated Rejections)", () => {
  it("declares sibling policy.ts = 'authenticated' for every account route", () => {
    expect(exportPolicy).toBe("authenticated");
    expect(erasureRequestPolicy).toBe("authenticated");
    expect(erasureConfirmPolicy).toBe("authenticated");
    expect(accountPolicy).toBe("authenticated");
  });

  it("rejects anonymous GET /api/account/export with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/account/export", {
      method: "GET",
    });
    const res = await exportGet(req);
    expect(res.status).toBe(401);
  });

  it("rejects anonymous POST /api/account/erasure/request with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/account/erasure/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await erasureRequestPost(req);
    expect(res.status).toBe(401);
  });

  it("rejects anonymous POST /api/account/erasure/confirm with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/account/erasure/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "fake" }),
    });
    const res = await erasureConfirmPost(req);
    expect(res.status).toBe(401);
  });

  it("rejects anonymous DELETE /api/account with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "fake" }),
    });
    const res = await accountDelete(req);
    expect(res.status).toBe(401);
  });
});

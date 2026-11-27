import { describe, expect, it } from "vitest";
import { readIdentityJsonObject } from "../src/modules/identity";

/**
 * The settings/privacy API contract: a malformed body is a 400 VALIDATION_ERROR
 * with a fixed message, not a silent empty object that later reads as
 * "password required" or "confirmation token is required".
 */
function bodyRequest(body: string): Request {
  return new Request("http://localhost/api/account/erasure/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("identity JSON body contract", () => {
  it("returns a JSON object unchanged", async () => {
    await expect(readIdentityJsonObject(bodyRequest('{"password":"secret"}'))).resolves.toEqual({
      password: "secret",
    });
  });

  it("rejects malformed JSON with the fixed validation message", async () => {
    await expect(readIdentityJsonObject(bodyRequest("{not json"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "A JSON object body is required",
    });
  });

  it.each(['[]', '42', '"text"', "null"])("%s is not an object body", async (raw) => {
    await expect(readIdentityJsonObject(bodyRequest(raw))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "A JSON object body is required",
    });
  });
});

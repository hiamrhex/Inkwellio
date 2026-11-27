import { createServer, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { GET, checkDatabaseHealth } from "../src/app/api/health/route";
import { policy } from "../src/app/api/health/policy";
import { closeDb, type HealthProbeClient } from "@/kernel/db";

describe("B3: Health check endpoint (/api/health, A11)", () => {
  it("has sibling policy 'public'", () => {
    expect(policy).toBe("public");
  });

  it("returns 503 when DATABASE_URL is unset", async () => {
    // In local unit test environment without DATABASE_URL
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const response = await GET();
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body).toEqual({ status: "unavailable" });

      // Minimal headers
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    } finally {
      if (origUrl) process.env.DATABASE_URL = origUrl;
    }
  });

  it("enforces 5-second timeout on unresponsive database", async () => {
    // Spin up a local TCP server that accepts connections but never replies (black hole).
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to obtain ephemeral port for mock TCP server");
    }

    const origUrl = process.env.DATABASE_URL;
    await closeDb();
    process.env.DATABASE_URL = `postgres://unresponsive_user:unresponsive_pass@127.0.0.1:${address.port}/inkwellio`;

    try {
      const start = performance.now();
      const healthy = await checkDatabaseHealth(100);
      const duration = performance.now() - start;

      // Must fail because the database was unresponsive
      expect(healthy).toBe(false);
      // Proves it actually waited for the 100ms timeout rather than failing fast
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(1000);
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await closeDb();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("releases the pooled client when the query times out, not just when it succeeds", async () => {
    // The regression this locks: a `Promise.race` whose query leg loses leaves
    // the acquired client unreleased. With `max: 5`, five timed-out probes
    // exhaust the pool and every later query in the process hangs.
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://probe_user:probe_pass@127.0.0.1:1/inkwellio";

    let releases = 0;
    const neverResolvingClient: HealthProbeClient = {
      query: () => new Promise<unknown>(() => {}),
      release: () => {
        releases += 1;
      },
    };

    try {
      const healthy = await checkDatabaseHealth(50, {
        connect: async () => neverResolvingClient,
      });
      expect(healthy).toBe(false);
      expect(releases).toBe(1);
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("releases the pooled client when the query succeeds", async () => {
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://probe_user:probe_pass@127.0.0.1:1/inkwellio";

    let releases = 0;
    const healthyClient: HealthProbeClient = {
      query: async () => ({ rows: [{ "?column?": 1 }] }),
      release: () => {
        releases += 1;
      },
    };

    try {
      const healthy = await checkDatabaseHealth(500, { connect: async () => healthyClient });
      expect(healthy).toBe(true);
      expect(releases).toBe(1);
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("does not leak a client when connect() itself never resolves", async () => {
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://probe_user:probe_pass@127.0.0.1:1/inkwellio";

    // Nothing was acquired, so there is nothing to release — but the caller
    // must still get an answer rather than hanging. The probe may try once;
    // what must never happen is a release of a client it never held.
    const releases = { count: 0 };
    const countingPool = {
      connect: () => {
        releases.count += 1;
        return new Promise<never>(() => {});
      },
    };
    try {
      const healthy = await checkDatabaseHealth(50, countingPool);
      expect(healthy).toBe(false);
      expect(releases.count).toBe(1);
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("returns minimal body without internal leak or stack trace", async () => {
    const response = await GET();
    const body = await response.json();

    const keys = Object.keys(body);
    expect(keys).toEqual(["status"]);
    expect(["ok", "unavailable"]).toContain(body.status);
  });
});

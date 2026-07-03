import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@codity/db";
import { buildServer } from "../src/server.js";

describe("auth routes", () => {
  let app: FastifyInstance;
  const email = `test-${randomUUID()}@example.com`;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registers a new user and returns tokens", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "password123", name: "Test User" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe(email);
  });

  it("rejects duplicate registration with 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "password123", name: "Test User" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("rejects invalid payloads with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short", name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it("rejects login with wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects protected routes without a token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/orgs" });
    expect(res.statusCode).toBe(401);
  });
});

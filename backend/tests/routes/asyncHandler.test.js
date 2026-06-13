// backend/tests/routes/asyncHandler.test.js
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { asyncHandler } from "../../src/middlewares/asyncHandler.js";

describe("asyncHandler", () => {
  it("forwards a rejected async handler to the error middleware (no crash)", async () => {
    const app = express();
    app.get("/boom", asyncHandler(async () => {
      throw new Error("gateway exploded");
    }));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("gateway exploded");
  });

  it("passes through a resolving handler normally", async () => {
    const app = express();
    app.get("/ok", asyncHandler(async (req, res) => res.status(200).json({ ok: true })));
    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

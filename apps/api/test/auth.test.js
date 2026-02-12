import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
process.env.ARKNAS_DB_PATH = `/tmp/arknas-test-${unique}/sqlite/arknas.db`;
process.env.CERTS_DIR = `/tmp/arknas-test-${unique}/certs`;
process.env.JWT_SECRET = "test-secret";
process.env.FORCE_HTTPS_AUTH = "0";
process.env.ALLOW_PLAINTEXT_LOGIN = "1";
process.env.SEED_ADMIN_FROM_ENV = "0";
process.env.DOCKER_HOST = "tcp://127.0.0.1:23750";

const { createApp } = await import("../src/app.js");
const app = createApp();

test("health endpoint should return ok", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("bootstrap admin then login and me should work", async () => {
  const statusBefore = await request(app).get("/api/auth/bootstrap-status");
  assert.equal(statusBefore.status, 200);
  assert.equal(statusBefore.body.bootstrapRequired, true);

  const bootstrap = await request(app)
    .post("/api/auth/bootstrap")
    .send({ username: "admin", password: "admin12345", confirmPassword: "admin12345" });

  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.initialized, true);
  assert.equal(bootstrap.body.user.username, "admin");

  const login = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin12345" });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.username, "admin");

  const me = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);

  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, "admin");

  const statusAfter = await request(app).get("/api/auth/bootstrap-status");
  assert.equal(statusAfter.status, 200);
  assert.equal(statusAfter.body.bootstrapRequired, false);
});

test("auth protected route should reject without token", async () => {
  const res = await request(app).get("/api/settings/integrations");
  assert.equal(res.status, 401);
});

test("app center route should reject without token", async () => {
  const res = await request(app).get("/api/apps");
  assert.equal(res.status, 401);
});

test("app task route should reject without token", async () => {
  const res = await request(app).get("/api/apps/tasks");
  assert.equal(res.status, 401);
});

test("app bundle route should reject without token", async () => {
  const res = await request(app).get("/api/apps/bundles");
  assert.equal(res.status, 401);
});

test("app task log route should reject without token", async () => {
  const res = await request(app).get("/api/apps/tasks/1/logs");
  assert.equal(res.status, 401);
});

test("app task retry route should reject without token", async () => {
  const res = await request(app).post("/api/apps/tasks/1/retry");
  assert.equal(res.status, 401);
});

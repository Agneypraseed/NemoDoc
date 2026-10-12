import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "selfsigned";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AgentConnectionStore,
  connectionInput,
  DeliveryRejected,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import {
  createSmtpTransport,
  smtpOptions,
  type SmtpTransportFactory,
} from "../server/smtp.ts";

const config = {
  apiKey: "",
  model: "nvidia/test-nemotron",
  baseUrl: "http://localhost:8000/v1",
};
// A fresh local testing certificate. No user credential or external SMTP
// account participates in these protocol tests.
const generated = await generate([{ name: "commonName", value: "localhost" }], {
  algorithm: "sha256",
  notBeforeDate: new Date(Date.now() - 60000),
  notAfterDate: new Date(Date.now() + 86400000),
  extensions: [
    { name: "basicConstraints", cA: true },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
      ],
    },
  ],
});
const certificate = { key: generated.private, cert: generated.cert };
const trustFixture: SmtpTransportFactory = (options) =>
  createSmtpTransport({
    ...options,
    tls: { ...options.tls, ca: certificate.cert, servername: "localhost" },
  });

async function mailbox(secure: boolean) {
  const messages: string[] = [];
  const server = new SMTPServer({
    secure,
    key: certificate.key,
    cert: certificate.cert,
    logger: false,
    closeTimeout: 1000,
    onAuth(auth, _session, callback) {
      if (
        auth.username !== "sender@example.com" ||
        auth.password !== "test-password"
      ) {
        const error = Object.assign(
          new Error("Rejected private test-password"),
          { responseCode: 535 },
        );
        callback(error);
      } else callback(null, { user: "fixture" });
    },
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (data) => chunks.push(Buffer.from(data)));
      stream.on("end", () => {
        messages.push(Buffer.concat(chunks).toString());
        callback();
      });
    },
  });
  server.on("error", () => {}); // Certificate-rejection test closes its socket.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.server.address() as AddressInfo).port;
  const store = new AgentConnectionStore(
    new SettingsStore(config),
    undefined,
    trustFixture,
  );
  store.save(
    connectionInput.parse({
      section: "email",
      smtpHost: "127.0.0.1",
      smtpPort: port,
      smtpSecurity: secure ? "tls" : "starttls",
      smtpUser: "sender@example.com",
      from: "sender@example.com",
      recipient: "owner@example.com",
      password: "test-password",
    }),
  );
  return {
    messages,
    store,
    close: () => new Promise<void>((resolve) => server.close(resolve)),
  };
}

for (const secure of [true, false]) {
  test(`SMTP ${secure ? "TLS" : "STARTTLS"} authenticates without sending, then submits the real message envelope and body`, async () => {
    const fixture = await mailbox(secure);
    try {
      await fixture.store.testEmail();
      assert.equal(fixture.messages.length, 0);
      const id = await fixture.store.send(
        fetch,
        fixture.store.target("email"),
        "Revision summary",
        "Use spaced practice. [1]",
        AbortSignal.timeout(5000),
      );
      assert.ok(id);
      assert.equal(fixture.messages.length, 1);
      assert.match(fixture.messages[0], /From: sender@example.com/);
      assert.match(fixture.messages[0], /To: owner@example.com/);
      assert.match(fixture.messages[0], /Subject: Revision summary/);
      assert.match(fixture.messages[0], /Use spaced practice/);
      assert.doesNotMatch(fixture.messages[0], /test-password/);
    } finally {
      await fixture.close();
    }
  });
}

test("SMTP authentication rejection is definite, secrets are redacted and untrusted certificates stay rejected", async () => {
  const fixture = await mailbox(true);
  try {
    fixture.store.value.email.password = "wrong-private-password";
    await assert.rejects(
      fixture.store.send(
        fetch,
        fixture.store.target("email"),
        "Summary",
        "Body",
        AbortSignal.timeout(5000),
      ),
      (error: unknown) =>
        error instanceof DeliveryRejected &&
        /authentication failed/.test(error.message) &&
        !/private|password"/.test(error.message),
    );
    assert.equal(fixture.messages.length, 0);
    fixture.store.value.email.password = "test-password";
    const untrusted = new AgentConnectionStore(new SettingsStore(config));
    Object.assign(untrusted.value.email, fixture.store.value.email);
    await assert.rejects(
      untrusted.testEmail(AbortSignal.timeout(5000)),
      /TLS verification failed/,
    );
    assert.equal(fixture.messages.length, 0);
    assert.doesNotMatch(
      JSON.stringify(fixture.store.public()),
      /test-password/,
    );
  } finally {
    await fixture.close();
  }
});

test("SMTP passwords follow the configured host and mailbox; the replaced API integration is retired without credential reuse", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-smtp-"));
  try {
    const filename = path.join(directory, "connections.json");
    const store = new AgentConnectionStore(new SettingsStore(config), filename);
    const fields = {
      section: "email",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecurity: "starttls",
      smtpUser: "sender@example.com",
      from: "sender@example.com",
      recipient: "owner@example.com",
    };
    store.save(
      connectionInput.parse({ ...fields, password: "private-smtp-password" }),
    );
    store.save(connectionInput.parse(fields));
    assert.equal(store.value.email.password, "private-smtp-password");
    store.save(
      connectionInput.parse({ ...fields, smtpHost: "other.example.com" }),
    );
    assert.equal(store.value.email.password, "");
    const value = JSON.parse(readFileSync(filename, "utf8"));
    value.email = {
      recipient: "owner@example.com",
      inboxId: "legacy",
      apiKey: "retired-api-key",
      revision: store.value.email.revision,
    };
    writeFileSync(filename, JSON.stringify(value));
    const restored = new AgentConnectionStore(
      new SettingsStore(config),
      filename,
    );
    assert.equal(restored.value.email.recipient, "owner@example.com");
    assert.equal(restored.value.email.password, "");
    assert.doesNotMatch(
      readFileSync(filename, "utf8"),
      /retired-api-key|inboxId/,
    );
    assert.equal(
      smtpOptions({ ...restored.value.email, smtpSecurity: "starttls" })
        .requireTLS,
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoGuardService } from "../demo/demo-guard.service.js";
import type { DemoSinkService } from "../demo/demo-sink.service.js";
import { MailService } from "./mail.service.js";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

const CONFIG: Record<string, unknown> = {
  SMTP_FROM: "erp@example.com",
  SMTP_HOST: "localhost",
  SMTP_PORT: 1025,
};

function makeService(sandbox: boolean) {
  const config = {
    getOrThrow: (key: string) => CONFIG[key],
    get: () => undefined,
  } as unknown as ConfigService;
  const guard = { isDemoSandbox: async () => sandbox } as unknown as DemoGuardService;
  const record = vi.fn().mockResolvedValue(undefined);
  const sink = { record } as unknown as DemoSinkService;
  return { mail: new MailService(config, guard, sink), record };
}

const message = {
  to: ["buyer@example.com"],
  subject: "Order update",
  text: "Your order shipped",
  attachments: [{ filename: "inv.pdf", content: Buffer.from("%PDF") }],
};

// M10 task 5.1 (demo-guardrails "Outbound email is sunk"): MailService is the chokepoint — a
// sandbox's message never reaches the nodemailer transport, whoever the caller is.
describe("MailService demo guardrail", () => {
  beforeEach(() => sendMail.mockReset());

  it("records a sandbox message in the sink and never transports it", async () => {
    const { mail, record } = makeService(true);
    await mail.send(message);
    expect(sendMail).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({
      channel: "email",
      to: ["buyer@example.com"],
      subject: "Order update",
      text: "Your order shipped",
      attachments: ["inv.pdf"],
    });
  });

  it("transports a customer tenant's message normally", async () => {
    const { mail, record } = makeService(false);
    await mail.send(message);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
  });
});

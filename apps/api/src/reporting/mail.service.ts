import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import { DemoGuardService } from "../demo/demo-guard.service.js";
import { DemoSinkService } from "../demo/demo-sink.service.js";

/** An outbound message — recipients, subject, body, and optional file attachments. */
export interface MailMessage {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

/**
 * SMTP transport (task 3.3, design D9) — a thin `nodemailer` wrapper. Credentials are optional
 * so a dev instance boots against a local relay (e.g. MailHog on `:1025`) without auth; when
 * `SMTP_USER`/`SMTP_PASS` are set they are used. A send that fails propagates so the enqueuing
 * worker can retry under `DEFAULT_JOB_OPTIONS` and, on exhaustion, raise an in-app alert.
 *
 * Demo guardrail (M10 task 5.1, design D7): `send` asks `DemoGuardService` first — a
 * `DEMO_SANDBOX` tenant's message is recorded by `DemoSinkService` and **never** reaches the
 * transport (no SMTP connection), and the call resolves normally so callers see the usual flow.
 */
@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    config: ConfigService,
    private readonly guard: DemoGuardService,
    private readonly sink: DemoSinkService,
  ) {
    this.from = config.getOrThrow<string>("SMTP_FROM");
    const user = config.get<string>("SMTP_USER");
    const pass = config.get<string>("SMTP_PASS");
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>("SMTP_HOST"),
      port: config.getOrThrow<number>("SMTP_PORT"),
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    if (await this.guard.isDemoSandbox()) {
      await this.sink.record({
        channel: "email",
        to: message.to,
        subject: message.subject,
        text: message.text ?? message.html,
        attachments: message.attachments?.map((a) => a.filename),
      });
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
  }
}

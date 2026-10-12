import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

export interface SmtpTransport {
  verify(): Promise<unknown>;
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string; accepted: unknown[]; rejected: unknown[] }>;
  close(): void;
}
export type SmtpTransportFactory = (
  options: SMTPTransport.Options,
) => SmtpTransport;
export const createSmtpTransport: SmtpTransportFactory = (options) =>
  nodemailer.createTransport(options);

export interface SmtpConnection {
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls";
  smtpUser: string;
  password: string;
  from: string;
  recipient: string;
}
export function smtpOptions(connection: SmtpConnection): SMTPTransport.Options {
  return {
    host: connection.smtpHost,
    port: connection.smtpPort,
    secure: connection.smtpSecurity === "tls",
    requireTLS: connection.smtpSecurity === "starttls",
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: { user: connection.smtpUser, pass: connection.password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

// Never include server responses, usernames, or password values in UI errors.
export function smtpError(
  error: unknown,
  operation: "send" | "verify" = "send",
) {
  const value = error as {
    code?: string;
    responseCode?: number;
    message?: string;
  };
  if (value.code === "EAUTH")
    return "SMTP authentication failed. Check the username and app password.";
  if (
    [
      "ETLS",
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(value.code || "") ||
    /certificate|TLS/i.test(value.message || "")
  )
    return "SMTP TLS verification failed. Check the host and encryption setting.";
  if (value.responseCode && value.responseCode >= 400)
    return `SMTP rejected the request (${value.responseCode}). Check the sender, recipient and account limits.`;
  return operation === "verify"
    ? "Could not connect to the SMTP server. Check the host, port, encryption and network access."
    : "Could not confirm SMTP delivery. Check the mailbox before sending again.";
}
export function smtpDefinitelyRejected(error: unknown) {
  const value = error as { code?: string; responseCode?: number };
  return (
    value.code === "EAUTH" ||
    value.code === "EENVELOPE" ||
    !!(value.responseCode && value.responseCode >= 400)
  );
}

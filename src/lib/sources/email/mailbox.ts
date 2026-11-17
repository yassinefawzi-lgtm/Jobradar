import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { ALERT_SENDERS, type AlertEmail } from "./parsers";

/** Boîte aux lettres lue par le connecteur (interface injectable pour les tests). */
export interface Mailbox {
  /** E-mails des expéditeurs d'alertes reçus depuis N jours. */
  fetchAlerts(sinceDays: number): Promise<(AlertEmail & { uid: number })[]>;
  /** Met les e-mails à la corbeille (Gmail les supprime définitivement après 30 jours). */
  trash(uids: number[]): Promise<number>;
  close(): Promise<void>;
}

/** Gmail en IMAP avec un mot de passe d'application (GMAIL_USER, GMAIL_APP_PASSWORD). */
export async function openGmail(env: Record<string, string | undefined> = process.env): Promise<Mailbox> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: env.GMAIL_USER!, pass: env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  return {
    async fetchAlerts(sinceDays) {
      const query = `{${ALERT_SENDERS.map((s) => `from:${s}`).join(" ")}} newer_than:${Math.max(1, sinceDays)}d`;
      const uids = (await client.search({ gmraw: query }, { uid: true })) || [];
      const out: (AlertEmail & { uid: number })[] = [];
      for (const uid of uids.slice(-200)) {
        const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        out.push({
          uid,
          from: parsed.from?.value.map((v) => v.address ?? "").join(",") ?? "",
          subject: parsed.subject ?? "",
          html: typeof parsed.html === "string" ? parsed.html : null,
          text: parsed.text ?? null,
          date: parsed.date ?? new Date(),
        });
      }
      return out;
    },
    async trash(uids) {
      if (!uids.length) return 0;
      const trashBox = (await client.list()).find((b) => b.specialUse === "\\Trash")?.path ?? "[Gmail]/Trash";
      const res = await client.messageMove(uids.join(","), trashBox, { uid: true });
      return res ? uids.length : 0;
    },
    async close() {
      lock.release();
      await client.logout();
    },
  };
}

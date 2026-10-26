"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "./contact.module.css";

type ReplyPreference = "email" | "call";

export default function ContactPage() {
  const [preference, setPreference] = useState<ReplyPreference>("email");
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          email: fields.get("email"),
          phone: fields.get("phone"),
          preference,
          message: fields.get("message"),
          website: fields.get("website")
        })
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Your message could not be sent.");
      form.reset();
      setPreference("email");
      setStatus({ kind: "success", message: "Message sent. Thank you — we’ll get back to you." });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Your message could not be sent. Please try again."
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles["contact-page"]}>
      <header className={styles["contact-topbar"]}>
        <Link className={styles["contact-brand"]} href="/" aria-label="Rwanda Land Intelligence home">
          <span className={styles["contact-brand-mark"]} aria-hidden="true">R</span>
          <span>Rwanda Land Intelligence</span>
        </Link>
        <Link className={styles["contact-back"]} href="/">Back to map <span aria-hidden="true">↗</span></Link>
      </header>

      <section className={styles["contact-layout"]}>
        <div className={styles["contact-intro"]}>
          <p className={styles["contact-eyebrow"]}>CONTACT</p>
          <h1>Let’s talk land.</h1>
          <p className={styles["contact-lede"]}>
            Ask about a location, report a data issue, or tell us what you are trying to find.
            Choose email or request a call-back.
          </p>
          {phone ? (
            <a className={styles["contact-call-link"]} href={"tel:" + phone.replace(/[^+\d]/g, "")}>
              Call us <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className={styles["contact-call-note"]}>Prefer a call? Select “Call me” and leave your number.</p>
          )}
          <div className={styles["contact-note"]}>
            <span className={styles["contact-note-dot"]} aria-hidden="true" />
            <p>We don’t ask you to send passwords, payment details, or confidential land-owner records through this form.</p>
          </div>
        </div>

        <form className={styles["contact-form"]} onSubmit={submit}>
          <div className={styles["contact-form-heading"]}>
            <h2>Send a message</h2>
            <p>We’ll use your details only to respond to this enquiry.</p>
          </div>
          <label>
            Your name
            <input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Full name" />
          </label>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" />
          </label>
          <label>
            Preferred reply
            <select value={preference} onChange={(event) => setPreference(event.target.value as ReplyPreference)}>
              <option value="email">Reply by email</option>
              <option value="call">Call me back</option>
            </select>
          </label>
          <label>
            Phone number {preference === "call" ? <span className={styles["contact-required"]}>(required for a call)</span> : <span className={styles["contact-optional"]}>(optional)</span>}
            <input name="phone" type="tel" autoComplete="tel" maxLength={40} required={preference === "call"} placeholder="+250 ..." />
          </label>
          <label>
            What can we help with?
            <textarea name="message" required minLength={10} maxLength={5000} rows={5} placeholder="Tell us what you need..." />
          </label>
          <label className={styles["contact-honeypot"]} aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {status ? <p className={`${styles["contact-status"]} ${status.kind === "success" ? styles["contact-status-success"] : styles["contact-status-error"]}`} role="status">{status.message}</p> : null}
          <button type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"} <span aria-hidden="true">↗</span></button>
          <p className={styles["contact-form-footnote"]}>Email delivery depends on the inbox being configured and the sender domain being verified.</p>
        </form>
      </section>
    </main>
  );
}

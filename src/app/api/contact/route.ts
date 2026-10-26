import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactPreference = "email" | "call";

type ContactMessage = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  preference?: unknown;
  message?: unknown;
  website?: unknown;
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let input: ContactMessage;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 12_000) {
      return NextResponse.json({ error: "Message is too large." }, { status: 413 });
    }
    input = JSON.parse(raw) as ContactMessage;
  } catch {
    return NextResponse.json({ error: "Please submit a valid message." }, { status: 400 });
  }

  // Quietly accept the bot-trap field without sending an email.
  if (text(input.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = text(input.name, 100);
  const email = text(input.email, 254).toLowerCase();
  const phone = text(input.phone, 40);
  const message = text(input.message, 5_000);
  const preference = input.preference === "call" ? "call" : "email";

  if (name.length < 2) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (!validEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (preference === "call" && phone.length < 6) {
    return NextResponse.json({ error: "Enter a phone number for a call-back." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "Please add a little more detail to your message." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.RESEND_TO_EMAIL?.trim();
  if (!apiKey || !from || !to || !validEmail(from) || !validEmail(to)) {
    return NextResponse.json(
      { error: "The contact inbox is not ready yet. Please try again later." },
      { status: 503 }
    );
  }

  const subjectName = name.replace(/[\r\n]+/g, " ").slice(0, 80);
  const emailText = [
    "New Rwanda Land Intelligence website enquiry",
    "",
    "Name: " + name,
    "Email: " + email,
    "Phone: " + (phone || "Not provided"),
    "Preferred reply: " + (preference === "call" ? "Phone call" : "Email"),
    "",
    "Message:",
    message
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: "Website enquiry · " + subjectName,
        text: emailText
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store"
    });

    if (!response.ok) {
      // Keep provider error bodies out of the public response and application logs.
      console.error("Contact email provider rejected a message. HTTP status:", response.status);
      return NextResponse.json(
        { error: "Your message could not be sent right now. Please try again later." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "The message service is temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}

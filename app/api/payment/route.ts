import { randomUUID } from "crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findProviderMessage(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findProviderMessage(item, depth + 1);
      if (message) return message;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const key of ["message", "error", "errors", "detail", "description"]) {
    const message = findProviderMessage(value[key], depth + 1);
    if (message) return message;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const message = findProviderMessage(nestedValue, depth + 1);
    if (message) return `${key}: ${message}`;
  }

  return undefined;
}

export async function POST(request: Request) {
  const secretKey = process.env.CHAPA_SECRET_KEY?.trim();
  if (!secretKey) {
    return Response.json(
      { error: "CHAPA_SECRET_KEY is missing from .env.local" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const firstName =
    isRecord(body) && typeof body.first_name === "string"
      ? body.first_name.trim()
      : "";
  const lastName =
    isRecord(body) && typeof body.last_name === "string"
      ? body.last_name.trim()
      : "";
  const email =
    isRecord(body) && typeof body.email === "string"
      ? body.email.trim()
      : "";

  if (
    !firstName ||
    !lastName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return Response.json(
      { error: "Enter your first name, last name, and a valid email address." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      "https://api.chapa.co/v1/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: "100",
          currency: "ETB",
          email,
          first_name: firstName,
          last_name: lastName,
          tx_ref: `pay-${randomUUID()}`,
          return_url: new URL("/", request.url).toString(),
          customization: {
            title: "Black Shoes",
            description: "Black Shoes payment",
          },
        }),
      }
    );

    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (isRecord(parsed)) data = parsed;
    } catch {
      // The HTTP status still identifies a non-JSON provider response.
    }

    if (!response.ok || data.status !== "success") {
      const providerMessage =
        findProviderMessage(data.error) ||
        findProviderMessage(data.errors) ||
        findProviderMessage(data.message) ||
        `Chapa returned HTTP ${response.status}${
          typeof data.status === "string" ? ` (${data.status})` : ""
        }`;

      console.error("Chapa rejected payment initialization:", {
        httpStatus: response.status,
        providerStatus: data.status,
        message: providerMessage,
      });

      return Response.json(
        { error: providerMessage },
        { status: response.ok ? 502 : response.status }
      );
    }

    const checkoutUrl = isRecord(data.data)
      ? data.data.checkout_url
      : undefined;
    if (typeof checkoutUrl !== "string") {
      return Response.json(
        { error: "Chapa did not return a checkout URL" },
        { status: 502 }
      );
    }

    let parsedCheckoutUrl: URL;
    try {
      parsedCheckoutUrl = new URL(checkoutUrl);
    } catch {
      return Response.json(
        { error: "Chapa returned an invalid checkout URL" },
        { status: 502 }
      );
    }

    if (
      parsedCheckoutUrl.protocol !== "https:" ||
      parsedCheckoutUrl.hostname !== "checkout.chapa.co"
    ) {
      return Response.json(
        { error: "Chapa returned an invalid checkout URL" },
        { status: 502 }
      );
    }

    return Response.json({ checkout_url: parsedCheckoutUrl.toString() });
  } catch (error) {
    console.error("Chapa payment initialization failed:", error);
    return Response.json(
      { error: "Could not connect to Chapa. Please try again." },
      { status: 502 }
    );
  }
}

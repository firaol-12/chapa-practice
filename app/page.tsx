
"use client";

import { useState, type FormEvent } from "react";

export default function Home() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        error?: string;
        checkout_url?: string;
      };

      if (!response.ok) {
        setError(data.error || "Payment initialization failed.");
        return;
      }

      if (!data.checkout_url) {
        setError("Chapa did not return a checkout link. Please try again.");
        return;
      }

      window.location.assign(data.checkout_url);
    } catch {
      setError("Could not reach the payment server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Chapa Payment Test</h1>
      <p>Black Shoes — 100 ETB</p>

      <form onSubmit={pay}>
        <label>
          First name
          <input
            name="first_name"
            autoComplete="given-name"
            value={form.first_name}
            onChange={(event) =>
              setForm({ ...form, first_name: event.target.value })
            }
            required
          />
        </label>
        <label>
          Last name
          <input
            name="last_name"
            autoComplete="family-name"
            value={form.last_name}
            onChange={(event) =>
              setForm({ ...form, last_name: event.target.value })
            }
            required
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Connecting to Chapa..." : "Pay 100 ETB"}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
    </main>
  );
}

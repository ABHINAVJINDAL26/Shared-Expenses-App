"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Invalid login credentials.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "1rem" }}>
      <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "2.5rem", boxShadow: "var(--shadow-md)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div className="logo-icon" style={{ margin: "0 auto 1rem", width: "50px", height: "50px", fontSize: "1.5rem" }}>S</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700 }}>Splitwise Pro</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Sign in to manage flat share expenses
          </p>
        </div>

        {error && (
          <div className="badge badge-anomaly" style={{ display: "block", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", fontSize: "0.8rem", textAlign: "center" }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "1.25rem" }}>
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="text-input"
              style={{ width: "100%" }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. aisha@example.com"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: "1.5rem" }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="text-input"
              style={{ width: "100%" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.85rem", fontSize: "0.95rem" }}
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "var(--accent-teal)", fontWeight: 600, textDecoration: "none" }}>
            Sign up here
          </Link>
        </div>

        <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          <h4 style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--accent-blue)" }}>🔑 Seeded Flatmates (Test Accounts)</h4>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
            Use any standard email with password <strong>password123</strong>:
          </p>
          <ul style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "1.25rem", marginTop: "0.25rem" }}>
            <li>aisha@example.com (Aisha)</li>
            <li>rohan@example.com (Rohan)</li>
            <li>priya@example.com (Priya)</li>
            <li>meera@example.com (Meera)</li>
            <li>sam@example.com (Sam)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

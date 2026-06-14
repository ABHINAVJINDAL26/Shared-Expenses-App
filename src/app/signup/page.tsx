"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [name, setName] = useState("");
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Failed to create account.");
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
            Create an account to join the flat share
          </p>
        </div>

        {error && (
          <div className="badge badge-anomaly" style={{ display: "block", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", fontSize: "0.8rem", textAlign: "center" }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "1.25rem" }}>
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="text-input"
              style={{ width: "100%" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Abhinav"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: "1.25rem" }}>
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="text-input"
              style={{ width: "100%" }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. abhinav@example.com"
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
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent-teal)", fontWeight: 600, textDecoration: "none" }}>
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}

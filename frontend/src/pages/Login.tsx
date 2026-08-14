import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">V</div>
          <div>
            <h1>VeloSafe</h1>
            <p>Traffic Enforcement System</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-hint">
          Demo accounts — admin: <code>admin / admin123</code> · operator: <code>operator / operator123</code>
        </div>
      </div>
    </div>
  );
}

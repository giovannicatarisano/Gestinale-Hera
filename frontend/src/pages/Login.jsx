import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/api";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Benvenuto, ${u.name}`);
      navigate(u.role === "admin" ? "/dashboard" : "/tabellone");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Accesso non riuscito");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left visual */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1618582948377-cd7eb0e8cb14?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "multiply",
          }}
        />
        <Logo size={40} light />
        <div className="relative z-10 max-w-md">
          <h1 className="font-head font-black text-5xl tracking-tighter leading-none">
            Pianificazione turni della flotta.
          </h1>
          <p className="mt-6 text-primary-foreground/80 text-base">
            Generazione automatica dei turni di raccolta nel rispetto delle abilitazioni al mezzo e al giro, con gestione intelligente delle sostituzioni.
          </p>
        </div>
        <div className="relative z-10 overline text-primary-foreground/60">Hera S.p.A. · Gestione Autisti</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo size={38} /></div>
          <div className="overline text-primary mb-2">Accesso Riservato</div>
          <h2 className="font-head font-black text-3xl tracking-tighter mb-8">Entra nel gestionale</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-semibold">Email aziendale</Label>
              <Input
                id="email"
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@hera.it"
                required
                className="mt-1.5 rounded-sm"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
              <Input
                id="password"
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-1.5 rounded-sm"
              />
            </div>
            <Button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="w-full rounded-sm bg-primary hover:bg-primary/90 font-semibold"
            >
              {loading ? "Accesso…" : (<><LogIn size={16} className="mr-2" /> Accedi</>)}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-4">
            <div className="overline text-muted-foreground mb-1">Accesso dipendenti</div>
            <p className="text-xs text-muted-foreground">
              Le credenziali degli autisti vengono create dall'amministratore dall'area gestione.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

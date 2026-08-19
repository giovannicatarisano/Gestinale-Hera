import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { apiError, getBaseUrl, setBaseUrl } from "../lib/api";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { LogIn, Server, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import axios from "axios";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Server settings state
  const [serverUrl, setServerUrlState] = useState(getBaseUrl());
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState(null); // 'ok' | 'err' | null
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setServerUrlState(getBaseUrl());
  }, [dialogOpen]);

  const testServerConnection = async () => {
    setIsTestingServer(true);
    setServerStatus(null);
    try {
      const trimmed = serverUrl.trim().replace(/\/+$/, "");
      // Build headers to bypass localtunnel / ngrok interstitial pages
      const headers = {};
      if (trimmed.includes("loca.lt") || trimmed.includes("localtunnel")) {
        headers["bypass-tunnel-reminder"] = "true";
      }
      if (trimmed.includes("ngrok")) {
        headers["ngrok-skip-browser-warning"] = "true";
      }
      const res = await axios.get(`${trimmed}/api/vehicles`, { timeout: 8000, headers });
      if (res.status >= 200 && res.status < 500) {
        setServerStatus("ok");
        toast.success("Connessione al server riuscita!");
      } else {
        setServerStatus("err");
        toast.error("Risposta inattesa dal server");
      }
    } catch (err) {
      setServerStatus("err");
      toast.error(`Impossibile contattare il server: ${err.message}`);
    } finally {
      setIsTestingServer(false);
    }
  };

  const saveServerSettings = () => {
    const trimmed = serverUrl.trim().replace(/\/+$/, "");
    setBaseUrl(trimmed);
    toast.success("Indirizzo server salvato!");
    setDialogOpen(false);
  };

  const resetServerDefault = () => {
    setBaseUrl(null);
    setServerUrlState(getBaseUrl());
    setServerStatus(null);
    toast.info("Indirizzo server ripristinato ai valori predefiniti.");
  };

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
          <div className="flex items-center justify-between mb-2">
            <div className="overline text-primary">Accesso Riservato</div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-2 rounded-md hover:bg-muted"
                  title="Configura indirizzo server per test mobile"
                >
                  <Server size={14} />
                  <span>Impostazioni Server</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 font-head">
                    <Server className="h-5 w-5 text-primary" />
                    Configurazione Server Backend
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Per testare l'applicazione su telefono, inserisci l'indirizzo IP del computer su cui gira il backend (es. <code>http://192.168.1.50:8001</code>).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <div>
                    <Label htmlFor="server-url" className="text-xs font-semibold">Indirizzo Server API</Label>
                    <Input
                      id="server-url"
                      type="url"
                      value={serverUrl}
                      onChange={(e) => {
                        setServerUrlState(e.target.value);
                        setServerStatus(null);
                      }}
                      placeholder="http://192.168.1.X:8001"
                      className="mt-1 font-mono text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testServerConnection}
                      disabled={isTestingServer || !serverUrl.trim()}
                      className="text-xs flex items-center gap-1.5"
                    >
                      {isTestingServer ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
                      Testa Connessione
                    </Button>

                    {serverStatus === "ok" && (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <CheckCircle2 size={15} /> Raggiungibile
                      </span>
                    )}
                    {serverStatus === "err" && (
                      <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                        <XCircle size={15} /> Non raggiungibile
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetServerDefault}
                    className="text-xs text-muted-foreground"
                  >
                    Reset Predefinito
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveServerSettings}
                    className="text-xs font-semibold"
                  >
                    Salva Modifiche
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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

import heraLogo from "../assets/hera-logo.png";

export default function Logo({ size = 34, showText = true, light = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img
        src={heraLogo}
        alt="Hera Turni Flotta"
        className="object-contain rounded-md shadow-xs shrink-0"
        style={{ width: size, height: size }}
      />
      {showText && (
        <div className="leading-none">
          <div
            className={`font-head font-black tracking-tighter ${light ? "text-white" : "text-foreground"}`}
            style={{ fontSize: size * 0.52 }}
          >
            Hera
          </div>
          <div className={`overline ${light ? "text-white/60" : "text-muted-foreground"}`} style={{ fontSize: size * 0.24 }}>
            Turni Flotta
          </div>
        </div>
      )}
    </div>
  );
}

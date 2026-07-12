export default function Logo({ size = 34, showText = true, light = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className="flex items-center justify-center bg-primary text-primary-foreground font-head font-black"
        style={{ width: size, height: size, borderRadius: 2 }}
      >
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>H</span>
      </div>
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

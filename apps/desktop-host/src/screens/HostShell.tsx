import { useState } from "react";
import { LocalHost } from "./LocalHost";
import { ModeSelect } from "./ModeSelect";
import { ServerHost } from "./ServerHost";

type Mode = "server" | "local";

export function HostShell() {
  const [mode, setMode] = useState<Mode | null>(null);

  if (mode === null) {
    return <ModeSelect onPick={setMode} />;
  }
  if (mode === "server") {
    return <ServerHost onBack={() => setMode(null)} />;
  }
  return <LocalHost onBack={() => setMode(null)} />;
}

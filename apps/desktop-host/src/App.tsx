import { ControlPanel } from "./control/ControlPanel";
import { HostShell } from "./screens/HostShell";

function isControlWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("window") === "control";
}

export default function App() {
  if (isControlWindow()) {
    return <ControlPanel />;
  }
  return <HostShell />;
}

import "./styles/room.css";
import "./loop/loop.css";
import "./room/room-extra.css";
import "./auth/auth.css";
import { Gate } from "./auth/Gate.js";
import { Workspace } from "./workspace/Workspace.js";

export function App() {
  return <Gate>{(session) => <Workspace mode="live" session={session} />}</Gate>;
}

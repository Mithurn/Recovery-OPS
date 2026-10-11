import "./styles/room.css";
import "./loop/loop.css";
import "./room/room-extra.css";
import { DemoScope } from "./demo/DemoScope";
import { Workspace } from "./workspace/Workspace";

export function DemoApp() {
  return (
    <DemoScope>
      <Workspace mode="demo" session={null} />
    </DemoScope>
  );
}

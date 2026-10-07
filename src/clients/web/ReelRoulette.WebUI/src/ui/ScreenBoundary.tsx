import { Component, type ComponentChildren } from "preact";
import { screenErrorLine } from "../logging/relayLogLines";

interface ScreenBoundaryProps {
  /** Names the screen in the line relayed to the server log. */
  screen: string;
  relay: (level: string, message: string) => void;
  children?: ComponentChildren;
}

interface ScreenBoundaryState {
  failed: boolean;
}

/**
 * A screen that throws while rendering stops showing and relays one line naming it to the server log. The
 * other screens keep working.
 */
export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  state: ScreenBoundaryState = { failed: false };

  static getDerivedStateFromError(): ScreenBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.relay("error", screenErrorLine(this.props.screen, error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid min-h-40 place-items-center gap-3 p-6 text-center">
        <p>This section could not be displayed.</p>
        <Button onClick={() => this.setState({ failed: false })}>Try again</Button>
      </div>
    );
  }
}

declare global {
  interface Window {
    cv?: any;
    Pose?: new (config: { locateFile: (file: string) => string }) => {
      setOptions: (options: Record<string, unknown>) => void;
      onResults: (callback: (results: { poseLandmarks?: Array<{ x: number; y: number; visibility?: number }> }) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
    };
  }
}

export {};

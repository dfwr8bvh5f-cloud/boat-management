"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { RippleLoader } from "@/components/ripple-loader";

// The AIS embed is a third-party iframe (marinetraffic.com) - unlike every
// other image/data source in this app, there's no server-side signal at all
// for whether it actually loaded: a slow connection, an ad/tracker blocker,
// or the service itself being unreachable all look identical from here -
// nothing fires and the visitor is left staring at a blank 520px rectangle
// with no explanation. A load timeout plus a real fallback message turns
// that silent gap into an honest "couldn't load" state.
const LOAD_TIMEOUT_MS = 8_000;

export function BoatLiveMap({ src, title, unavailableLabel }: { src: string; title: string; unavailableLabel: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "timeout">("loading");

  useEffect(() => {
    const timer = setTimeout(() => setState((s) => (s === "loading" ? "timeout" : s)), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative h-[520px] w-full">
      {state !== "loaded" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-fleet-paper">
          {state === "loading" ? (
            <RippleLoader size="md" className="text-fleet-border" />
          ) : (
            <>
              <MapPin size={20} className="text-fleet-brass" />
              <p className="text-xs text-fleet-ink">{unavailableLabel}</p>
            </>
          )}
        </div>
      )}
      <iframe
        title={title}
        src={src}
        className={`h-full w-full border-0 transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={() => setState("loaded")}
      />
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Orb } from "./Orb";

function Splash() {
  return (
    <div className="app-bg flex h-dvh w-full items-center justify-center">
      <Orb size={72} active />
    </div>
  );
}

export const ClientApp = dynamic(() => import("./ChatApp").then((m) => m.ChatApp), {
  ssr: false,
  loading: Splash,
});

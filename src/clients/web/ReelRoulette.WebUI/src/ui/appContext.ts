import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { AppServices } from "../state/appServices";

export const AppContext = createContext<AppServices | null>(null);

/** The page's store, API, and server connection. */
export function useApp(): AppServices {
  const services = useContext(AppContext);
  if (!services) {
    throw new Error("useApp needs an AppContext provider.");
  }
  return services;
}

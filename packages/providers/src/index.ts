// @mandhira/providers — the ONLY package where vendor SDKs and third-party HTTP APIs may
// be imported (ARCHITECTURE §1; enforced by a no-restricted-imports lint rule in apps).
//
// One interface per capability, concrete adapters swappable by environment.
// RoutingProvider, WeatherProvider, EmailProvider and PushProvider arrive with the features
// that need them (B-020 onward).

export * from "./geocoding";
export * from "./ai";

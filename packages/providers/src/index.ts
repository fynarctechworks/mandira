// @mandhira/providers — the ONLY package where vendor SDKs and third-party HTTP APIs may
// be imported (ARCHITECTURE §1; enforced by a no-restricted-imports lint rule in apps).
//
// One interface per capability, concrete adapters swappable by environment.
// WeatherProvider and EmailProvider arrive with the features that need
// them (B-020 onward).

export * from "./geocoding";
export * from "./ai";
export * from "./push";
export * from "./routing";

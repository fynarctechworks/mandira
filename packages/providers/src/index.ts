// @mandhira/providers — the ONLY package where vendor SDKs and third-party HTTP APIs may
// be imported (ARCHITECTURE §1; enforced by a no-restricted-imports lint rule in apps).
//
// One interface per capability, concrete adapters swappable by environment.

export * from "./geocoding";
export * from "./ai";
export * from "./capture";
export * from "./email";
export * from "./errors";
export * from "./push";
export * from "./routing";
export * from "./weather";

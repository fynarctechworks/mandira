import base from "@mandhira/config/eslint/base";

// The one package vendor SDKs are allowed in (CLAUDE.md §4).
export default [...base, { rules: { "no-restricted-imports": "off" } }];

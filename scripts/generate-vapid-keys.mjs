#!/usr/bin/env node
/**
 * Generates a VAPID keypair for Web Push.
 *
 * Run once per environment and paste the output into that environment's secrets. The
 * public key also has to reach the browser as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, because the
 * subscription is created client-side.
 *
 * Rotating these is not routine: every existing subscription is signed against the old
 * pair, so changing them silently stops notifications for everyone until each browser
 * subscribes again. Treat a lost private key as an incident, not an inconvenience.
 */
// web-push is CommonJS, so the named export has to come off the default.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to your environment (never commit them):

  VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}
  VAPID_SUBJECT=mailto:support@mandhira.in

And expose the public half to the browser, which needs it to subscribe:

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
`);

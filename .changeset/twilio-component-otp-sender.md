---
"@vortex-api/convex-auth": minor
---

Add `createConvexTwilioOtpSender(twilio)` — an OTP sender backed by the official `@convex-dev/twilio` component (`app.use(twilio)` + `new Twilio(components.twilio, { defaultFrom })`). Each send is recorded in the component's own tables, and delivery status is tracked when you register the component's Twilio webhook callback — making it the recommended sender for production phone OTP. `createTwilioSmsOtpSender` remains the zero-dependency path.

To support component-backed senders, `PhoneOtpSender` now receives the calling action's `ctx` as a second argument: `sendPhoneOtp({ phone, otp, type }, ctx)`. Existing `(data) => Promise<string>` senders keep working unchanged — they simply don't declare the second parameter.

# ELYSIUM launch gate

Do not open public sign-up or accept live money until every critical item is checked.

## Infrastructure and security
- [ ] Production Supabase project has backups and restricted operator access.
- [ ] Schema migration applied and RLS reviewed using anonymous, learner, owner and admin accounts.
- [ ] Email confirmation, password reset and redirect URLs tested on the deployed domain.
- [ ] Paystack test and live keys are stored only as Edge Function secrets.
- [ ] Webhook signature and independent transaction verification tested.
- [ ] Paid file cannot be downloaded by an unauthenticated user or a user without a purchase.
- [ ] Private resource bucket remains private; signed links expire.
- [ ] Rate limits, abuse reporting, moderation and account deletion workflow are implemented.
- [ ] CSP and all response headers tested against the production domain.
- [ ] Error monitoring, backup restore drill and support contact are configured.

## Product and content
- [ ] All published resources have verified rights, accurate descriptions, working files and correct prices.
- [ ] No placeholder/sample reviews, download counts or testimonials are presented as real.
- [ ] Refund/cancellation policy, privacy notice and terms match the actual business and applicable law.
- [ ] Moderator/admin onboarding and offboarding are documented.
- [ ] Checkout, failed payment, abandoned payment, duplicate webhook and refund scenarios tested.
- [ ] Search, save, sign-in, post, reply, like, library and download flows tested end to end.

## Quality evidence
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Lighthouse/accessibility checks run on the deployed site.
- [ ] Keyboard-only and screen-reader checks completed.
- [ ] Responsive tests completed at 320px, 375px, tablet and desktop widths.
- [ ] At least five representative users complete key tasks without coaching; issues are fixed and retested.
- [ ] Independent security review completed before handling real payments or sensitive user data.

A 9.8/10 score is not claimed until there is documented evidence from these checks and real-user feedback.

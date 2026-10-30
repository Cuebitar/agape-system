# AGAPE · 爱加倍 — Online Offering System

A real Node.js + PostgreSQL application for church artwork offering intentions. Guest page `/`, private admin page `/admin`.

## Run locally
1. Install Node.js 20+ and provision a PostgreSQL database (Supabase works).
3. `npm install`
4. Copy `.env.example` to `.env` and set `DATABASE_URL`, `ADMIN_PASSWORD`, and `SESSION_SECRET`. This project is configured for Supabase project `iotiizffueukibasnptt` (Cuebitar's Project); replace `<DATABASE_PASSWORD>` in the direct PostgreSQL URL with the database password from Supabase Dashboard → Project Settings → Database. Keep `DATABASE_SSL=true`. Load it with your environment manager, or run `node --env-file=.env server.js` (Node 20.6+). `.env` is ignored by Git.
5. Visit `http://localhost:3000/admin`; add artworks before opening. Guest page is `/`.
6. `npm test` runs allocation logic tests.

## Deploy online
Deploy as a Node web service (e.g. Render, Railway, or Fly.io) and provision a **persistent managed PostgreSQL database**. Set `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`, `DATABASE_SSL` per your provider, and use `npm start`. Use HTTPS (platform-provided). Add artwork image URLs hosted on HTTPS. After deployment, make a QR code pointing to your deployed guest URL. This package does not automatically create hosting accounts, provision databases, or publish a URL.

## Rules
- Each guest selects one artwork or Random, enters an offering amount, and may optionally pledge the amount even if unsuccessful.
- Each artwork has `quantity` slots. Specific-artwork submissions fill slots by amount descending, server timestamp ascending, ID ascending.
- Random submissions are then processed by amount descending, timestamp ascending, ID ascending; each replaces the **lowest** allocated slot it strictly exceeds, or fills an unclaimed slot first. Equal amounts never displace an existing allocation.
- All amounts remain private. Finalize only after closing; this transaction locks submissions and stores the final result.
- No automatic payment processing. Admin confirms payments manually; a `cancelled` payment does not automatically reallocate.

## Important operational notes
- **Random behavior**: this implementation gives priority to specific-artwork selections in the initial allocation and then inserts Random offerings by amount. A Random offer may replace a specific offer even if the specific offer was submitted earlier, but only for a strictly greater amount. Random offers cannot force a guest to receive more than one artwork from one submission.
- **Ties**: for identical specific-artwork amounts, earliest server submission wins. Among Random offers with the same amount, earliest submission is evaluated first. Random offers do not displace equal amounts.
- **Multi-quantity**: quantity >1 creates multiple allocation slots. This version treats them as separate competitive slots, not fixed-price first-come-first-served.
- **Initial pledges**: existing church members' prior artwork sponsorship is not recorded as a competing offer in this system. Artwork `minimum_amount` represents a floor, not a prior bid.
- **Editing**: add artwork before opening. This version does not allow artwork edits or deletions, and finalization cannot be reversed.
- **Donation obligations**: successful offers create a manual payment obligation. Unsuccessful guests who opted into unconditional donation should be followed up separately, not treated as already paid.
- **Security**: use a strong password and secret, private database, HTTPS, database backups, and restrict admin access. The login uses a signed cookie. Do not use real attendee data until you have tested and reviewed the app, including data protection and local legal/tax treatment of donation-linked artwork allocations.
- **Production hardening**: recommended before a large public event: staff accounts with MFA, audit logs, image upload/storage, notifications, phone verification, backups/restore drill, monitoring, automated integration tests, privacy notice and retention policy. This is a working MVP, not an audited production platform.

## V2: stage screen and timed category rounds

- `/stage` is the dedicated 16:9 projector display. It automatically refreshes, shows the current category, artwork photos and minimum offering amounts, a 2:00 countdown, and a QR code for the guest website.
- `/admin` controls the rounds. Press **Start 2:00** for Personal, Family, Church, or General. The database sets the deadline; guests may only submit during that category's open window. Admin may close a round early. Once closed, the stage reveals successful allocations, amounts, and either the approved stage name or an anonymous label.
- **Random** is limited to the active category, must meet the artwork minimum, and can only replace an allocation with a strictly lower offering. Equal amounts go to the earlier submission.
- Results are **offering intentions, not confirmed payments**. Staff must separately confirm payment and collection. Stage results are final for the round and should not be presented as paid receipts.
- For a production QR code, set `PUBLIC_URL=https://your-real-domain.example` (HTTPS). The QR generator is local to the server; it does not send the URL to a third-party QR service.
- Art photos currently use **HTTPS image URLs**, not direct file uploads. Hosting/storage integration is still needed for dashboard photo upload.
- IMPORTANT: the system has not been load-tested or deployed. Test using fake guest records before the event; verify server clock, hosting, database connection, projector resolution, privacy consent, and simultaneous submissions.

# Testing real GPS

How to get a phone in a vehicle reporting its position, and a second phone watching it move
on a map — before OTP, and before the Flutter app.

## 1. Connect the map

The map is the one piece that needs a key from Google.

1. **console.cloud.google.com** → create a project (or pick one).
2. **APIs & Services → Library** → enable **Maps JavaScript API**.
3. **Billing** → attach a billing account. Google requires one even inside the free monthly
   credit; at pilot volume you will not approach it.
4. **APIs & Services → Credentials → Create credentials → API key**.
5. **Restrict the key** before using it anywhere:
   - *Application restrictions* → **Websites**, and add the sites that may use it:
     `http://localhost:3000/*`, plus your deployed domain when you have one.
   - *API restrictions* → **Restrict key** → tick **Maps JavaScript API** only.
6. Put it in **both** `.env.local` files:

   ```bash
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
   ```

Restart the dev servers. The schematic preview map is replaced by a real map of Hassan.

Two things worth knowing. The key is public — it ships in the page, which is why the referrer
restriction is what protects it, not secrecy. And testing on a phone over your laptop's IP
(`http://192.168.x.x:3000`) will be refused by a key restricted to `localhost`: add that
origin too, or test the map on the laptop.

## 2. Switch the apps to the database

In both `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_DATA_SOURCE=supabase
NEXT_PUBLIC_AUTH_MODE=anonymous
```

`anonymous` means Supabase issues a real token with no SMS. Every security rule still
applies — this is not a way around them, it is a way around the SMS provider. Enable it once:
**Supabase → Authentication → Providers → Anonymous sign-ins**.

## 3. Drive

| Device | Open | What it does |
| --- | --- | --- |
| Phone in the vehicle | `/worker` | Pair to a worker, **START WORK**, reports GPS |
| Second phone | `/` | Pick the ward, watch the vehicle move |
| Laptop | `/ops/live-map` | The fleet view of the same vehicle |

The worker page shows what is actually happening: readings taken, readings the server stored,
readings it refused, and how many are queued waiting for signal.

**Keep the worker page open with the screen on.** A browser stops reporting location when the
screen locks — that limitation is exactly why the worker app has to be Flutter. Everything
else in the pipeline is real.

## What to watch for on the drive

- **The truck should not teleport.** Bad fixes are dropped, not smoothed, so the marker holds
  its last good position rather than jumping down a side street.
- **Refused readings are normal.** The server drops anything wider than 100 m, out of order,
  or closer together than 4 seconds. A steady trickle of refusals is the filter working.
- **Drive through a dead spot on purpose.** The queue should grow, then drain by itself when
  the signal returns, and the citizen map should show the real last-updated time throughout —
  never a false "live".
- **Stop for two minutes.** The citizen screen should move from LIVE to CONNECTION LOST after
  45 seconds without a fix, by itself.

## Before a real ward goes on this system

Device pairing is a deliberate hole while it is on: any signed-in device can claim a worker
record. It exists because OTP is not connected yet.

```sql
update app_settings set value = 'false'::jsonb where key = 'allow_worker_self_link';
```

Then set `NEXT_PUBLIC_AUTH_MODE=otp` once the SMS provider and the DLT template are live.

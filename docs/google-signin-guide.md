# Switching on "Continue with Google" for the site editor

The site editor's sign-in screen already has a **Continue with Google** button (`authProviders: ["google"]` in `assets/js/config.js`). It fails until Google sign-in is switched on in Supabase. This takes about 15 minutes and is free.

## Part 1: Google Cloud (create the sign-in credentials)

1. Go to https://console.cloud.google.com and sign in with the federation's Google account (use a shared federation account, not a personal one, so it does not depend on one person).
2. Top bar, project picker, **New project**. Name it `YNEPF site`. Create it and make sure it is selected.
3. Menu, **APIs & Services, OAuth consent screen** (Google may call this **Google Auth Platform**). Choose **External**.
   - App name: `YNEPF site editor`. User support email: `info@ynepf.co.uk`. Developer contact email: `info@ynepf.co.uk`.
   - **Authorised domains:** add `ynepf.co.uk` and `supabase.co`.
   - Scopes: leave the defaults (email, profile, openid). These need no Google review.
4. Still on the consent screen, set **Publishing status** to **In production** (button: Publish app). If you leave it on "Testing", only people you list as test users can sign in. Publishing with only these basic scopes is instant and needs no verification.
5. **APIs & Services, Credentials, Create credentials, OAuth client ID.**
   - Application type: **Web application**. Name: `Supabase`.
   - **Authorised JavaScript origins:** `https://www.ynepf.co.uk` and your preview address (`https://ynepf-micro-site-git-entry-system-antjtws-projects.vercel.app`).
   - **Authorised redirect URIs:** exactly this one:
     `https://altuwgzzouwhrsdnzadj.supabase.co/auth/v1/callback`
   - Create. Copy the **Client ID** and **Client secret** (keep the secret in a password manager; never paste it into a chat or the site's files).

## Part 2: Supabase

1. **Authentication, Sign In / Providers, Google.** Switch it **on**, paste the Client ID and Client secret, save.
2. **Authentication, URL Configuration:**
   - **Site URL:** `https://www.ynepf.co.uk`
   - **Redirect URLs:** add `https://www.ynepf.co.uk/admin/**`, `https://ynepf-micro-site-git-entry-system-antjtws-projects.vercel.app/admin/**`, and (if you test on your own computer) `http://localhost:8766/admin/**`.
   Without these, Google signs the person in but Supabase sends them somewhere else.

## Part 3: Give someone access

Google sign-in only proves who someone is. They still need to be on the list: **Users** tab in the site editor, add their email address and a role. It must be the email of the Google account they will use. Anyone else who signs in with Google sees "No access yet".

## Test it

1. Open `/admin` in a private window and press **Continue with Google**.
2. Choose a Google account whose email you have added in the Users tab. You should land in the editor.
3. Try a Google account that is not on the list: you should see "No access yet".

If Google shows `redirect_uri_mismatch`, the redirect URI in Part 1 step 5 is not exactly the one above. If you land back on the sign-in page with an error in the address, check the Redirect URLs in Part 2 step 2.

## Things to know

- **Same person, two ways in.** A person who already created a password login with the same email can use either. Supabase links them by email.
- **Google Workspace or Gmail both work.** The email just has to match what is in the Users tab.
- **Google asks for a privacy policy link** before it lets you publish the app: use `https://www.ynepf.co.uk/privacy` (the site editor now has a privacy policy page; it goes live on that address when the site is merged).
- **Apple sign-in** is not set up (it needs a paid Apple Developer account). The button only shows for providers listed in `authProviders`.

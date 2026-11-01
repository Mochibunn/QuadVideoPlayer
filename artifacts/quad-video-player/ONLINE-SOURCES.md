# Online media sources

All source retrieval runs on the Android device. There is no required Replit
connection, proxy backend, or published server for these features. Local media
playback remains independent of online access.

## booru.org boards

Open **Settings → Online media sources → Add search**. Choose **booru.org board**,
give the search a name, enter its HTTPS board URL, and set tags. Space-separated
tags combine terms, underscores join words, and `-tag` excludes a term, subject
to the board's own tag syntax.

The board must expose a public Gelbooru-style DAPI endpoint. The app accepts XML
and common JSON response shapes, sends an identifying User-Agent, and supports
pagination. It does not bypass API blocks, sign-in requirements, or browser
challenges. An inactive or API-restricted board produces an explicit error.
The safe-rated filter is enabled initially and is also checked client-side.

## Reddit account setup

The Replit account connection was not enabled. Instead, the optional **Reddit
account** section uses Reddit's installed-app OAuth flow directly on the device.
Before it can work, supply the public client ID of a Reddit installed app with
the necessary Reddit API authorization/approval. Never supply a password or
client secret. Register this exact redirect URI:

    com.mochi.quadvideoplayer://oauth/reddit

The sign-in button opens Reddit's consent page in the system browser. Requested
scopes are only `identity read`; the app does not post, vote, or subscribe.
Access and refresh tokens stay in Android-backed SecureStore, never in
AsyncStorage, project environment variables, source definitions, or session
exports. Sign-in validates random OAuth state and the complete callback
destination. Refresh requests are serialized, and disconnect invalidates
in-flight authorization so it cannot restore removed credentials.

Disconnect clears local credentials and fetched Reddit results. It also attempts
online token revocation. If offline, local disconnect still succeeds and the app
explains how to revoke access through Reddit's account permissions.

Add subreddit names separated by commas or `+`; each named search keeps its own
subreddits, sorting, pagination and media results. Supported media include
direct images/GIFs, galleries, and native Reddit video playlists. Where available,
HLS/DASH is preferred to a potentially silent fallback MP4. Video-based GIFs go
to the video player, not an additional video decoder in every overlay.
Unsupported external hosting links are skipped, not scraped or misrepresented
as full media. Original-post links remain available for attribution.

Reddit access is not live-verified until the owner supplies a valid client ID
and completes consent on a physical device. Missing authorization, denied
access, rate limiting and unavailable subreddits remain explicit errors.

## Assign independent image searches

In **Image / GIF slideshow**, select an instance and choose its image source:
the existing local pool or any named online search. Multiple instances can share
one search, and different instances can use different searches without merging
their image pools. Timers and native-driver bounce remain independent.

For online videos use **Play source videos** in the source manager. Replacing
an active video pool requires confirmation and never deletes local files or
the saved session.

Search definitions persist locally. **Save session** includes search definitions,
source assignments and live slideshow indices, but no Reddit credentials.
Online streams need internet and may expire. Refresh a source and play its
current videos again if old links are no longer available.

## Verification

The source/parser, OAuth and session test scripts exercise native auth using
synthetic responses, secure-store mocks, and API fixtures. They cover declined
consent, forged callbacks, serialized refresh, disconnect races, independent
queries, pagination, late deleted-source responses, failed storage writes,
remote/local access checks, and older session compatibility. They are not proof
of access to every hosted board or live Reddit authorization.

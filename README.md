# Another view of Michael Le

An independent home for the portfolio Duy built at
[michalle.foundable.app](https://michalle.foundable.app/).
Preserves its original colors, fonts, seven pages and visual storytelling.
Live destination: [another.duyle.me](https://another.duyle.me).
Original portfolio: [duyle.me](https://duyle.me).

The main refinement is motion: messy documents become precise regions,
normalized text, source-linked chunks, then embeddings and grounded answers.
Scroll scenes, typography, pointer response and page transitions share the
same restrained visual language. Reduced-motion visitors get readable
snapshots of every stage. No scroll hijacking or builder runtime.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://localhost:4317`. Node 22+ is required. Preview uses ephemeral
memory when Redis credentials are absent; production requires durable storage.

```sh
npm run build
npm run check
npm test
npm run test:browser
```

Browser verification uses the installed Google Chrome. Set `TEST_URL` to check
a deployed version. Screenshots and the verification report go into `evidence/`.
Email-provider requests are intercepted during browser tests: no test email
is dispatched.

## Structure

- `src/pages/`: the author's original page markup, formatted for editing.
- `src/styles/`: original fonts, base design and parsing styles; motion refinements.
- `src/client/`: motion, navigation and contact behavior.
- `src/templates/`: shared page shell and contact form.
- `src/data/portfolio.json`: public career and writing links from the original portfolio.
- `src/server/`: contact validation, durable storage and delivery receipts.
- `scripts/build.mjs`: deterministic static output into `dist/`.
- `api/index.js`: shared Vercel function for `/api/contact` and `/api/health`.

See [the implementation brief](docs/implementation.md) and
[source provenance](docs/source-manifest.json).

## Contact

Copy `.env.example` to `.env.local` for local configuration. Production secrets
belong in Vercel. The recipient is fixed to `levduyit@gmail.com`.

The default reuses FormSubmit, the provider used by the original portfolio.
A message is stored before one browser relay is authorized. Request IDs and
one-use nonces prevent duplicate dispatch; an uncertain send is not retried
automatically. Drafts survive errors. Relay acknowledgements are submission
reports, not inbox-delivery evidence. A verified Resend sender can be selected
with `CONTACT_PROVIDER=resend`.

Contact records expire after 90 days in a separate `anotherportfolio` Redis
namespace. Inspect saved notes privately with:

```sh
node --env-file=.env.local scripts/inbox.mjs --production
```

The command prints private messages to the local terminal. Do not save that
output in Git or deployment logs. There is no public admin interface.

## Deploy

The repository is configured for Vercel static hosting plus a Node 22 function.
Set the variables documented in `.env.example`, link the project, then run:

```sh
npx vercel deploy --prod
```

`another.duyle.me` must point to the CNAME target returned by Vercel for this
project. DNS is managed separately from the original portfolio's deployment.

Fonts are retained from the authored app; their OFL licenses are in
`public/fonts/`. All portfolio design and content belong to the author.

# adola

Node.js SDK for the Adola compression API.

```bash
npm install github:JBunga/adola-node
```

```ts
import { Adola } from "adola";

const client = new Adola({ apiKey: process.env.ADOLA_API_KEY });
const result = await client.compress({
  input: "Adola compresses long prompts before they reach your model.",
  query: "What does Adola do?",
  compression: { target_ratio: 0.4 },
});

console.log(result.output);
console.log(result.receipt.tokens_saved);
```

The client defaults to `https://api.adola.app`. Set `ADOLA_BASE_URL` for local testing.

The repository contains only the SDK client and does not include the Adola application codebase.

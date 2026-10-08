# @caplet/core

Reader, validator, resolver, schemas, and diagnostics for the
[Agent Capability Format](https://github.com/barisgit/agent-capability-format) (ACF).
No network or git access; CI linters and validators can depend on this package alone.

```ts
import { readRepositoryCapabilities } from "@caplet/core";

const { capabilities, diagnostics } = await readRepositoryCapabilities("./my-capability");
```

Most consumers want [`@caplet/sdk`](https://www.npmjs.com/package/@caplet/sdk) instead.

## License

Apache-2.0

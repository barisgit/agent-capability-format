# @caplet/sdk

High-level API for reading
[Agent Capability Format](https://github.com/barisgit/agent-capability-format) (ACF)
capabilities at runtime. Re-exports `@caplet/core`, `@caplet/adapters`, and
`@caplet/installer`.

```ts
import { getSkills } from "@caplet/sdk";

const skills = await getSkills({ target: "pi", scope: "all", cwd: process.cwd() });
```

## License

Apache-2.0

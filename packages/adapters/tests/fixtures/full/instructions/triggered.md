---
name: triggered
description: Triggered guidance
activation:
  when:
    operation_result:
      conditions:
        - "error"
    file_context:
      paths:
        - "**/*.ts"
---
Apply this when TypeScript files or operation results need attention.
